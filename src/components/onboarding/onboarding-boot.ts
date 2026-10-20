/* Marginalia · first-run guide: boot part (plan 2.9)
   Decides, once per sign-in, whether this account still needs the three-step guide, and loads it only if so.
   The decision is stored on the account (users/{uid}.settings.onboarding), so skipping or finishing it holds
   on every device. An account that already has three books and a highlight is marked done without ever
   showing it. Signed-out visitors never see it.
*/

import { doc, onSnapshot, setDoc, type DocumentData } from 'firebase/firestore';
import { MarginaliaAuth } from '../../firebase/auth.ts';
import { Paths } from '../../firebase/paths.ts';
import { logError } from '../../services/analytics.ts';
import { BooksStore } from '../../store/books-store.ts';
import { HighlightsStore } from '../../store/highlights-store.ts';

export type OnboardingState = 'done' | 'skipped';

/** Books the guide asks for in its first step. */
export const GUIDE_BOOKS = 3;
/** How long to let the stores deliver their first data before judging the account (a hard reload briefly shows nothing). */
const SETTLE_MS = 2500;

let decidedFor: string | null = null;

export async function recordOnboarding(uid: string, state: OnboardingState): Promise<void> {
  const db = MarginaliaAuth?.db;
  if (!db) return;
  await setDoc(doc(db, Paths.user(uid)), { settings: { onboarding: { state, at: Date.now() } } }, { merge: true });
}

/**
 * The account document once the server has answered and nothing of ours is still in flight. Right after sign-in
 * another write to this document (the consent mirror) can be pending, and a plain read then returns a view
 * built from that write alone, hiding the stored decision (seen in the e2e as the guide returning after a skip).
 * Null when no settled answer arrives in time.
 */
function settledUserDoc(uid: string, timeoutMs = 8000): Promise<DocumentData | null> {
  const db = MarginaliaAuth?.db;
  if (!db) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    let stop: () => void = () => undefined;
    const finish = (value: DocumentData | null) => { if (done) return; done = true; stop(); clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => finish(null), timeoutMs);
    stop = onSnapshot(doc(db, Paths.user(uid)), { includeMetadataChanges: true }, (snap) => {
      if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) finish(snap.data() ?? {});
    }, () => finish(null));
  });
}

async function decide(uid: string): Promise<void> {
  const db = MarginaliaAuth?.db;
  if (!db || decidedFor === uid) return;
  decidedFor = uid;
  try {
    const data = await settledUserDoc(uid);
    if (data === null || data.settings?.onboarding?.state) { if (data === null) decidedFor = null; return; } // already decided (on some device), or unknown: stay quiet

    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    if (MarginaliaAuth?.user?.uid !== uid) return;
    const books = BooksStore.hasOwnBooks() ? BooksStore.getAll().length : 0;
    const highlights = HighlightsStore.getAll().length;
    if (books >= GUIDE_BOOKS && highlights >= 1) { await recordOnboarding(uid, 'done'); return; }

    const m = await import('./onboarding.ts');
    m.showOnboarding(uid);
  } catch (err) {
    decidedFor = null;
    logError(err, { context: 'onboarding decide' });
  }
}

export function startOnboarding(): void {
  window.addEventListener('marginalia:auth-changed', (event) => {
    const uid = (event as CustomEvent<{ user?: { uid?: string } | null }>).detail?.user?.uid;
    if (!uid) {
      decidedFor = null;
      document.getElementById('onboardingGuide')?.remove();
      return;
    }
    void decide(uid);
  });
}
