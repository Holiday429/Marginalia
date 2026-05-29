import { logError } from '../services/analytics.ts';

type RoomTrackKind = 'builtin' | 'custom';

interface ManifestTrack {
  id?: string;
  title?: string;
  subtitle?: string;
  artist?: string;
  file?: string;
}

interface ManifestPayload {
  tracks?: ManifestTrack[];
}

interface RoomTrack {
  id: string;
  kind: RoomTrackKind;
  title: string;
  subtitle: string;
  url: string;
}

interface StoredCustomTrackRecord {
  id: string;
  title: string;
  subtitle: string;
  blob: Blob;
  createdAt: number;
}

interface RoomAudioSettings {
  selectedTrackId: string;
  volume: number;
  muted: boolean;
}

interface RoomAudioState {
  ready: boolean;
  tracks: RoomTrack[];
  selectedTrackId: string;
  volume: number;
  muted: boolean;
  isPlaying: boolean;
  statusMessage: string;
}

const AUDIO_MANIFEST_URL = '/audio/room/manifest.json';
const AUDIO_SETTINGS_STORAGE_KEY = 'marginalia_room_audio_settings_v1';
const AUDIO_DB_NAME = 'marginalia-room-audio';
const AUDIO_DB_VERSION = 1;
const AUDIO_DB_STORE = 'custom-tracks';
const CUSTOM_TRACK_LIMIT = 3;

const listeners = new Set<() => void>();

const state: RoomAudioState = {
  ready: false,
  tracks: [],
  selectedTrackId: '',
  volume: 0.62,
  muted: false,
  isPlaying: false,
  statusMessage: '',
};

let audioEl: HTMLAudioElement | null = null;
let initPromise: Promise<void> | null = null;
let dbPromise: Promise<IDBDatabase | null> | null = null;
let customTrackUrls: string[] = [];
let bodyViewObserver: MutationObserver | null = null;

function emit(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // No-op.
    }
  });
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function readSettings(): RoomAudioSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY) || '{}') as Partial<RoomAudioSettings>;
    return {
      selectedTrackId: String(parsed.selectedTrackId || ''),
      volume: clamp(Number(parsed.volume ?? 0.62)),
      muted: Boolean(parsed.muted),
    };
  } catch {
    return {
      selectedTrackId: '',
      volume: 0.62,
      muted: false,
    };
  }
}

function writeSettings(): void {
  try {
    localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify({
      selectedTrackId: state.selectedTrackId,
      volume: state.volume,
      muted: state.muted,
    }));
  } catch {
    // Ignore storage failures.
  }
}

function ensureAudioElement(): HTMLAudioElement {
  if (audioEl) return audioEl;

  audioEl = new Audio();
  audioEl.loop = true;
  audioEl.preload = 'metadata';
  audioEl.addEventListener('play', () => {
    state.isPlaying = true;
    state.statusMessage = '';
    emit();
  });
  audioEl.addEventListener('pause', () => {
    state.isPlaying = false;
    emit();
  });
  audioEl.addEventListener('error', () => {
    state.isPlaying = false;
    state.statusMessage = 'This track could not be played.';
    emit();
  });

  return audioEl;
}

function applyVolume(): void {
  const element = ensureAudioElement();
  element.volume = state.muted ? 0 : state.volume;
}

function getSelectedTrack(): RoomTrack | null {
  return state.tracks.find((track) => track.id === state.selectedTrackId) || null;
}

function setAudioSource(track: RoomTrack | null): void {
  const element = ensureAudioElement();
  if (!track) {
    element.pause();
    element.removeAttribute('src');
    element.load();
    return;
  }
  if (element.dataset.trackId === track.id) return;
  element.pause();
  element.src = track.url;
  element.dataset.trackId = track.id;
  element.load();
}

function normalizeManifestTrack(track: ManifestTrack, index: number): RoomTrack | null {
  const file = String(track.file || '').trim();
  const title = String(track.title || '').trim();
  if (!file || !title) return null;

  const subtitle = String(track.subtitle || track.artist || 'Built-in soundtrack').trim() || 'Built-in soundtrack';
  const id = String(track.id || `builtin-${index + 1}`).trim();
  const url = file.startsWith('/') ? file : `/audio/room/${file}`;
  return {
    id,
    kind: 'builtin',
    title,
    subtitle,
    url,
  };
}

async function loadBuiltinTracks(): Promise<RoomTrack[]> {
  try {
    const response = await fetch(AUDIO_MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok) return [];
    const payload = await response.json() as ManifestPayload;
    return Array.isArray(payload.tracks)
      ? payload.tracks.map(normalizeManifestTrack).filter(Boolean) as RoomTrack[]
      : [];
  } catch {
    return [];
  }
}

function revokeCustomTrackUrls(): void {
  customTrackUrls.forEach((url) => URL.revokeObjectURL(url));
  customTrackUrls = [];
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(AUDIO_DB_STORE)) {
          db.createObjectStore(AUDIO_DB_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return null;
    try {
      const tx = db.transaction(AUDIO_DB_STORE, mode);
      const store = tx.objectStore(AUDIO_DB_STORE);
      return run(store);
    } catch {
      return null;
    }
  });
}

function idbGetAll(store: IDBObjectStore): Promise<StoredCustomTrackRecord[]> {
  return new Promise((resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as StoredCustomTrackRecord[] : []);
    request.onerror = () => resolve([]);
  });
}

function idbPut(store: IDBObjectStore, value: StoredCustomTrackRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function idbDelete(store: IDBObjectStore, key: string): Promise<void> {
  return new Promise((resolve) => {
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

async function loadCustomTracks(): Promise<RoomTrack[]> {
  revokeCustomTrackUrls();

  const records = await withStore('readonly', async (store) => idbGetAll(store));
  const normalized = Array.isArray(records) ? records : [];

  return normalized
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .map((record) => {
      const url = URL.createObjectURL(record.blob);
      customTrackUrls.push(url);
      return {
        id: record.id,
        kind: 'custom',
        title: String(record.title || 'Untitled track'),
        subtitle: String(record.subtitle || 'Personal upload'),
        url,
      } satisfies RoomTrack;
    });
}

function syncTrackList(tracks: RoomTrack[]): void {
  state.tracks = tracks;
  if (!tracks.some((track) => track.id === state.selectedTrackId)) {
    state.selectedTrackId = tracks[0]?.id || '';
  }
  setAudioSource(getSelectedTrack());
  writeSettings();
}

function deriveTitleFromFile(file: File): string {
  const raw = String(file.name || 'Untitled track').replace(/\.[a-z0-9]+$/i, '');
  return raw.replace(/[_-]+/g, ' ').trim() || 'Untitled track';
}

function createCustomTrackRecord(file: File): StoredCustomTrackRecord {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: deriveTitleFromFile(file),
    subtitle: 'Personal upload',
    blob: file,
    createdAt: Date.now(),
  };
}

function ensureViewObserver(): void {
  if (bodyViewObserver || !document.body) return;
  bodyViewObserver = new MutationObserver(() => {
    if (document.body.dataset.view !== 'room' && state.isPlaying) {
      ensureAudioElement().pause();
    }
  });
  bodyViewObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-view'],
  });
}

async function refreshTracks(): Promise<void> {
  const [builtinTracks, customTracks] = await Promise.all([
    loadBuiltinTracks(),
    loadCustomTracks(),
  ]);
  syncTrackList([...builtinTracks, ...customTracks]);
  emit();
}

async function playSelectedTrack(): Promise<boolean> {
  const track = getSelectedTrack();
  if (!track) {
    state.statusMessage = state.ready ? 'Add built-in room tracks to start playback.' : '';
    emit();
    return false;
  }

  const element = ensureAudioElement();
  setAudioSource(track);
  applyVolume();

  try {
    await element.play();
    state.statusMessage = '';
    return true;
  } catch (error) {
    state.isPlaying = false;
    state.statusMessage = 'Playback was blocked. Tap play again.';
    emit();
    return false;
  }
}

export const RoomAudio = {
  async init(): Promise<void> {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const settings = readSettings();
      state.selectedTrackId = settings.selectedTrackId;
      state.volume = settings.volume;
      state.muted = settings.muted;

      ensureAudioElement();
      applyVolume();
      ensureViewObserver();

      await refreshTracks();
      state.ready = true;
      emit();
    })().catch((error) => {
      logError(error instanceof Error ? error : new Error(String(error)), { context: 'room-audio init' });
      state.ready = true;
      state.statusMessage = 'Room audio could not be initialized.';
      emit();
    });

    return initPromise;
  },

  getState(): RoomAudioState {
    return {
      ready: state.ready,
      tracks: state.tracks.slice(),
      selectedTrackId: state.selectedTrackId,
      volume: state.volume,
      muted: state.muted,
      isPlaying: state.isPlaying,
      statusMessage: state.statusMessage,
    };
  },

  getCustomTrackLimit(): number {
    return CUSTOM_TRACK_LIMIT;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  async selectTrack(trackId: string, { autoplay = false }: { autoplay?: boolean } = {}): Promise<boolean> {
    await this.init();
    const track = state.tracks.find((item) => item.id === trackId) || null;
    if (!track) return false;
    state.selectedTrackId = track.id;
    setAudioSource(track);
    writeSettings();
    emit();
    return autoplay ? playSelectedTrack() : true;
  },

  async togglePlayback(): Promise<boolean> {
    await this.init();
    const element = ensureAudioElement();
    if (state.isPlaying && !element.paused) {
      element.pause();
      return false;
    }
    return playSelectedTrack();
  },

  setVolume(nextVolume: number): void {
    state.volume = clamp(nextVolume);
    applyVolume();
    writeSettings();
    emit();
  },

  setMuted(nextMuted: boolean): void {
    state.muted = Boolean(nextMuted);
    applyVolume();
    writeSettings();
    emit();
  },

  async addCustomTrack(file: File): Promise<void> {
    await this.init();

    if (!(file instanceof File) || !String(file.type || '').startsWith('audio/')) {
      throw new Error('Only audio files are supported.');
    }

    const existing = await withStore('readonly', async (store) => idbGetAll(store));
    const current = Array.isArray(existing) ? existing : [];
    if (current.length >= CUSTOM_TRACK_LIMIT) {
      throw new Error(`You can keep up to ${CUSTOM_TRACK_LIMIT} personal tracks here.`);
    }

    const record = createCustomTrackRecord(file);
    const saved = await withStore('readwrite', async (store) => {
      await idbPut(store, record);
      return true;
    });
    if (!saved) {
      throw new Error('Local music storage is unavailable in this browser.');
    }

    await refreshTracks();
    state.selectedTrackId = record.id;
    setAudioSource(getSelectedTrack());
    writeSettings();
    state.statusMessage = `${record.title} was added to your room.`;
    emit();
  },

  async removeCustomTrack(trackId: string): Promise<void> {
    await this.init();
    const target = state.tracks.find((track) => track.id === trackId);
    if (!target || target.kind !== 'custom') return;

    await withStore('readwrite', async (store) => {
      await idbDelete(store, trackId);
      return true;
    });

    const wasSelected = state.selectedTrackId === trackId;
    const wasPlaying = state.isPlaying;
    await refreshTracks();
    state.statusMessage = `${target.title} was removed.`;
    if (wasSelected) {
      setAudioSource(getSelectedTrack());
      if (wasPlaying) {
        await playSelectedTrack();
      }
    }
    emit();
  },
};
