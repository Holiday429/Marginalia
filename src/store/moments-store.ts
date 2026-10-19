/* Marginalia · Moments store (finish ritual, plan 2.3)
   One document per book at workspaces/{ws}/users/{uid}/moments/{bookId}: the reader's three answers and
   the AI finish card (an AiBlock, so the reader's own edit wins over the original). The existence of the
   document is also what stops the ritual from being offered twice for the same book.
   Signed-out visitors have no moments (the ritual needs the AI gateway, which needs an account).
*/

import { doc, getDoc, getDocs, collection, setDoc } from 'firebase/firestore';
import { MarginaliaAuth } from '../firebase/auth.ts';
import { WsPaths } from '../firebase/paths.ts';
import { getWorkspaceId } from '../firebase/workspace.ts';
import { logError } from '../services/analytics.ts';
import { validateWrite, withMeta } from '../services/db.ts';
import { MomentSchema, FinishCardSchema, type FinishAnswers, type FinishCard, type Moment } from '../data/schema/moment.ts';
import { resolveAiContent, type AiBlock } from '../data/schema/ai-block.ts';

export const MOMENTS_CHANGED_EVENT = 'marginalia:moments-changed';

let _cacheUid: string | null = null;
let _cache = new Map<string, Moment | null>(); // bookId → moment, or null once known to be absent
let _listed = false;

function ctx(): { uid: string; db: NonNullable<typeof MarginaliaAuth.db> } | null {
  const uid = MarginaliaAuth?.user?.uid;
  const db = MarginaliaAuth?.db;
  if (!uid || !db) return null;
  if (_cacheUid !== uid) { _cacheUid = uid; _cache = new Map(); _listed = false; }
  return { uid, db };
}

function emit(): void {
  window.dispatchEvent(new CustomEvent(MOMENTS_CHANGED_EVENT));
}

function parse(data: unknown): Moment | null {
  const result = MomentSchema.safeParse(data);
  return result.success ? result.data : null;
}

async function get(bookId: string): Promise<Moment | null> {
  const c = ctx();
  if (!c) return null;
  if (_cache.has(bookId)) return _cache.get(bookId) ?? null;
  try {
    const snap = await getDoc(doc(c.db, WsPaths.moment(getWorkspaceId(), c.uid, bookId)));
    const moment = snap.exists() ? parse(snap.data()) : null;
    _cache.set(bookId, moment);
    return moment;
  } catch (err) {
    logError(err, { context: 'MomentsStore.get', bookId });
    return null;
  }
}

/** Every moment of the signed-in reader (used to mark finished books that have a card). */
async function list(): Promise<Moment[]> {
  const c = ctx();
  if (!c) return [];
  if (!_listed) {
    try {
      const snap = await getDocs(collection(c.db, WsPaths.moments(getWorkspaceId(), c.uid)));
      snap.docs.forEach((d) => { const m = parse(d.data()); if (m) _cache.set(d.id, m); });
      _listed = true;
    } catch (err) {
      logError(err, { context: 'MomentsStore.list' });
    }
  }
  return [..._cache.values()].filter((m): m is Moment => Boolean(m));
}

async function write(bookId: string, data: Record<string, unknown>): Promise<Moment> {
  const c = ctx();
  if (!c) throw new Error('Sign in to keep a finish card.');
  const payload = validateWrite(MomentSchema, { bookId, kind: 'finish', ...data });
  await setDoc(doc(c.db, WsPaths.moment(getWorkspaceId(), c.uid, bookId)), withMeta(payload), { merge: true });
  _cache.set(bookId, payload as Moment);
  emit();
  return payload as Moment;
}

/** The reader dismissed the ritual: remember it so it is not offered again. */
function saveSkipped(bookId: string): Promise<Moment> {
  return write(bookId, { state: 'skipped', finishedAt: Date.now() });
}

/** Store the answers, and the finish card when there is one. */
function saveCompleted(bookId: string, answers: FinishAnswers, card: FinishCard | null): Promise<Moment> {
  const block: AiBlock<FinishCard> | undefined = card ? { original: card, generatedAt: Date.now(), promptVersion: '1' } : undefined;
  return write(bookId, { state: 'completed', answers, finishedAt: Date.now(), ...(block ? { card: block } : {}) });
}

/** What a view should show: the reader's edit if any, else the generated card. */
function cardOf(moment: Moment | null | undefined): FinishCard | null {
  if (!moment?.card) return null;
  const parsed = FinishCardSchema.safeParse(resolveAiContent(moment.card as AiBlock<unknown>));
  return parsed.success ? parsed.data : null;
}

/** Synchronous check against what has been loaded so far. */
function hasCardCached(bookId: string): boolean {
  return Boolean(cardOf(_cache.get(bookId)));
}

export const MomentsStore = { get, list, saveSkipped, saveCompleted, cardOf, hasCardCached };
