export const LIBRARY_STORAGE_KEY = 'marginalia:library-layout:v6';
export const LIBRARY_WORLD_WIDTH = 3200;
export const LIBRARY_WORLD_HEIGHT = 3200;
export const LIBRARY_ZOOM_MIN = 0.44;
export const LIBRARY_ZOOM_MAX = 1.9;
export const LIBRARY_FIT_ZOOM_MIN = 0.16;
export const LIBRARY_DRAG_THRESHOLD = 8;
export const LIBRARY_MAX_ROWS = 6;
export const LIBRARY_WHEEL_STEP = 0.018;

export const LIBRARY_TAB_ITEMS = [
  { id: 'library', label: 'Library' },
  { id: 'map', label: 'Map' },
  { id: 'web', label: 'Graph' },
  { id: 'profile', label: 'Profile' },
  { id: 'todo', label: 'To Do' },
];

export const LIBRARY_DEFAULT_SHELVES = [
  { id: 'reading', name: 'Reading', rows: 2, color: '#8da6d9', viewMode: 'spine', status: 'reading', bookKeys: [], x: 80, y: 40, tilt: 0, pitch: 0, yaw: 0 },
  { id: 'to-read', name: 'To Read', rows: 2, color: '#d4a869', viewMode: 'cover', status: 'want', bookKeys: [], x: 540, y: 140, tilt: 0, pitch: 0, yaw: 0 },
  { id: 'finished', name: 'Finished', rows: 2, color: '#95a78d', viewMode: 'mix', status: 'finished', bookKeys: [], x: 980, y: 70, tilt: 0, pitch: 0, yaw: 0 },
  { id: 'confirm-later', name: 'Confirm Later', rows: 2, color: '#7f7568', viewMode: 'spine', status: 'confirmed-later', bookKeys: [], x: 1420, y: 120, tilt: 0, pitch: 0, yaw: 0 },
];

export const LIBRARY_STATE = {
  records: [],
  recordByKey: new Map(),
  shelves: [],
  pool: [],
  drag: null,
  shelfDrag: null,
  interaction: { type: 'idle', pointerId: null, target: null },
  view: { x: 0, y: 0, scale: 1 },
  camera: { yaw: 0, pitch: 0 },
  sceneMode: 'spatial',
  searchQuery: '',
  searchMatches: [],
  searchIndex: 0,
  overlay: { playing: false, key: '', sourceShelfId: '', timers: [] },
  activeShelfId: '',
  arrangeMode: 'status',
  entrySource: 'library',
  entryMode: 'organize',
  bound: false,
  selectMode: false,
};

export function containsCJK(value) {
  return /[\u4e00-\u9fff\u3040-\u30ff]/.test(String(value || ''));
}

export function normalizeShelfMode(value) {
  if (value === 'cover') return 'cover';
  if (value === 'mix') return 'mix';
  return 'spine';
}

export function normalizeReadingStatus(status) {
  if (status === 'reading') return 'reading';
  if (status === 'finished') return 'finished';
  if (status === 'want' || status === 'to-read') return 'want';
  if (status === 'confirmed-later' || status === 'confirm-later') return 'confirmed-later';
  return 'confirmed-later';
}

export function normalizeShelfId(id) {
  if (id === 'reading-now') return 'reading';
  if (id === 'reading-plan') return 'to-read';
  return id || '';
}

export function normalizeShelfName(name, id) {
  if (id === 'reading-now' || id === 'reading') return 'Reading';
  if (id === 'reading-plan' || id === 'to-read') return 'To Read';
  if (id === 'confirm-later') return 'Confirm Later';
  return name || 'Shelf';
}

export function mapStatusToShelfId(status) {
  const normalized = normalizeReadingStatus(status);
  if (normalized === 'reading') return 'reading';
  if (normalized === 'finished') return 'finished';
  if (normalized === 'want') return 'to-read';
  return 'confirm-later';
}

export function statusToLabel(status) {
  const normalized = normalizeReadingStatus(status);
  if (normalized === 'reading') return 'Reading';
  if (normalized === 'finished') return 'Finished';
  if (normalized === 'want') return 'To Read';
  return 'Confirm Later';
}

export function escapeHTML(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function escapeAttr(value) {
  return escapeHTML(value).replaceAll("'", '&#39;');
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'book';
}

export function toTitleCase(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(' ');
}

export function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function clampInt(value, min, max, fallback) {
  return Math.round(clamp(Number(value), min, max, fallback));
}

export function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

export function getColorHue(input) {
  if (!input || typeof input !== 'string') return 0;
  const hex = input.trim().toLowerCase();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(hex)) return 0;

  const norm = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;

  const r = parseInt(norm.slice(1, 3), 16) / 255;
  const g = parseInt(norm.slice(3, 5), 16) / 255;
  const b = parseInt(norm.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;

  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = ((b - r) / delta) + 2;
  else hue = ((r - g) / delta) + 4;

  const deg = hue * 60;
  return Math.round(deg < 0 ? deg + 360 : deg);
}
