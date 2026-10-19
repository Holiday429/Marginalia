/* Marginalia · Captures store (plan 2.1)
   A quick capture is a highlight with source 'quick'. Until the reader attributes it to a book its
   bookId is '' (it then shows up in "unattributed captures"); attributing only changes bookId, so the
   id, timestamps and any resurface schedule stay the same. Every capture is stored on this device
   first and sent to Firestore from the outbox, so it survives going offline.
   Emits 'marginalia:captures-changed'.
*/

import { logError } from '../services/analytics.ts';
import { track } from '../services/events.ts';
import { CaptureOutbox } from './capture-outbox.ts';
import { HighlightsStore, type HighlightRecord } from './highlights-store.ts';
import { NotesStore } from './notes-store.ts';

export const CAPTURES_CHANGED_EVENT = 'marginalia:captures-changed';
export const CAPTURE_MAX_CHARS = 1000;

const isUnattributed = (h: { bookId?: unknown }) => !h.bookId;

function emit(): void {
  window.dispatchEvent(new CustomEvent(CAPTURES_CHANGED_EVENT));
}

/** Send one record to Firestore; it leaves the outbox once the server has accepted it. */
function push(uid: string, record: Record<string, unknown> & { id: string }): Promise<void> {
  return HighlightsStore.save(record)
    .then(() => CaptureOutbox.remove(record.id))
    .catch((err) => { logError(err, { context: 'CapturesStore push', id: record.id }); });
}

async function send(record: HighlightRecord): Promise<void> {
  const uid = HighlightsStore.getUid();
  if (!uid) return; // signed out: the device copy is the record
  await CaptureOutbox.put({ id: record.id, uid, record });
  void push(uid, record); // resolves whenever the network allows; the outbox covers a reload in between
}

/** Re-send everything this user captured that Firestore has not confirmed yet. */
async function flush(): Promise<void> {
  const uid = HighlightsStore.getUid();
  if (!uid) return;
  for (const entry of await CaptureOutbox.list(uid)) void push(uid, entry.record);
}

async function add({ quote, bookId = null }: { quote: string; bookId?: string | null }): Promise<HighlightRecord> {
  const text = quote.trim().slice(0, CAPTURE_MAX_CHARS);
  if (!text) throw new Error('Nothing to capture.');
  const id = `hl-quick-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const record = (await NotesStore.saveHighlight(bookId ?? '', { id, quote: text, source: 'quick' }, { remote: false })) as unknown as HighlightRecord;
  await send(record);
  track('highlight_saved', { source: 'quick', bookId: bookId || null, count: 1 });
  emit();
  return record;
}

/** Unattributed quick captures, newest first. */
async function list(): Promise<HighlightRecord[]> {
  const uid = HighlightsStore.getUid();
  let rows: HighlightRecord[];
  if (uid) {
    const remote = HighlightsStore.getAll().filter((h) => isUnattributed(h) && h.source === 'quick');
    const pending = (await CaptureOutbox.list(uid)).map((e) => e.record as unknown as HighlightRecord).filter(isUnattributed);
    const seen = new Set(remote.map((h) => h.id));
    rows = [...remote, ...pending.filter((h) => !seen.has(h.id))];
  } else {
    rows = ((await NotesStore.getHighlights('')) as unknown as HighlightRecord[]).filter((h) => h.source === 'quick');
  }
  return rows.sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));
}

async function attribute(id: string, bookId: string): Promise<void> {
  if (!bookId) throw new Error('A book is required.');
  const current = (await list()).find((h) => h.id === id);
  if (!current) throw new Error('Capture not found.');
  const record = (await NotesStore.saveHighlight(bookId, { ...current, id, bookId }, { remote: false })) as unknown as HighlightRecord;
  await send(record);
  emit();
}

let _started = false;
/** Call once: re-sends the outbox when the network returns and when a user signs in. */
function start(): void {
  if (_started) return;
  _started = true;
  window.addEventListener('online', () => { void flush(); });
  window.addEventListener('marginalia:auth-changed', () => { setTimeout(() => { void flush(); }, 0); });
  window.addEventListener('marginalia:highlights-changed', emit);
}

export const CapturesStore = { start, add, list, attribute, flush };
