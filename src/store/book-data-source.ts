/* ==========================================================================
   Marginalia · Book data sources
   --------------------------------------------------------------------------
   BooksStore reads books only through a BookDataSource:
     - FirestoreDataSource: the signed-in user's own books (onSnapshot). Empty means empty.
     - DemoDataSource:      the single demo library, signed-out visitors only.
   Signed-in users never touch the demo source, so demo data can never leak
   into a real library.
   ========================================================================== */

import { collection, onSnapshot, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { WsPaths } from '../firebase/paths.ts';
import { DEMO_BOOKS } from '../data/demo/index.ts';
import { NotesStore } from './notes-store.ts';

export interface BookRecord {
  id: string;
  [key: string]: unknown;
}

export interface BookDataSource {
  readonly kind: 'firestore' | 'demo';
  /** Calls `emit` with the full list now and after every change. Returns an unsubscribe. */
  watchBooks(emit: (books: BookRecord[]) => void, onError: (err: Error) => void): Unsubscribe;
}

export function createFirestoreSource(db: Firestore, workspaceId: string, uid: string): BookDataSource {
  return {
    kind: 'firestore',
    watchBooks(emit, onError) {
      return onSnapshot(
        collection(db, WsPaths.books(workspaceId, uid)),
        (snapshot) => emit(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
        onError,
      );
    },
  };
}

/** Signed-out visitors: the demo library plus any books they added locally (IndexedDB). */
export function createDemoSource(): BookDataSource {
  return {
    kind: 'demo',
    watchBooks(emit) {
      let cancelled = false;
      const demo = DEMO_BOOKS as BookRecord[];
      emit([...demo]);
      Promise.resolve(NotesStore?.ready?.())
        .then(() => NotesStore?.getAllBooks?.())
        .then((local) => {
          const mine = ((local ?? []) as BookRecord[]).filter((b) => !demo.some((d) => d.id === b.id));
          if (!cancelled && mine.length) emit([...mine, ...demo]);
        })
        .catch(() => undefined); // local books are best-effort
      return () => { cancelled = true; };
    },
  };
}
