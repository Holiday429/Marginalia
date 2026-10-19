/* Marginalia · capture outbox
   A quick capture is written to this device first. Until Firestore confirms the write it also sits
   here, tagged with the uid that made it, so a page reload (or a closed tab) while offline does not
   lose it: the next sign-in of the same user, or the browser coming back online, sends it again.
   Writes are idempotent (same document id), so a duplicate send is harmless.
*/

import { logError } from '../services/analytics.ts';

const DB_NAME = 'marginalia-outbox';
const STORE = 'highlights';

export interface OutboxEntry {
  id: string;
  uid: string;
  record: Record<string, unknown> & { id: string };
}

let _dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { logError(req.error ?? new Error('outbox open failed'), { context: 'capture-outbox open' }); resolve(null); };
  });
  return _dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return open().then((db) => new Promise<T | null>((resolve) => {
    if (!db) return resolve(null);
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { logError(req.error ?? new Error('outbox request failed'), { context: 'capture-outbox' }); resolve(null); };
    } catch (err) {
      logError(err, { context: 'capture-outbox' });
      resolve(null);
    }
  }));
}

export const CaptureOutbox = {
  async put(entry: OutboxEntry): Promise<void> { await run('readwrite', (s) => s.put(entry)); },
  async remove(id: string): Promise<void> { await run('readwrite', (s) => s.delete(id)); },
  async list(uid: string): Promise<OutboxEntry[]> {
    const all = (await run('readonly', (s) => s.getAll() as IDBRequest<OutboxEntry[]>)) ?? [];
    return all.filter((e) => e.uid === uid);
  },
};
