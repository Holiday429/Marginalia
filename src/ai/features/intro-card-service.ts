/* Marginalia · pre-read card, generated in the background when a book is added (plan 2.2).
   It costs one of the free monthly generations, so it is only ever started from Add Book — never from
   an import — and when the quota is used up it stops quietly and the page offers the manual button.
*/

import { getAiBlock, saveAiOriginal } from '../../store/ai-results-store.ts';
import { MarginaliaAI, AI_QUOTA_EXCEEDED } from '../../services/ai-gateway.ts';
import { logError } from '../../services/analytics.ts';
import { parseModelJson } from './parse-model-json.ts';

export type IntroCardState = 'pending' | 'ready' | 'quota' | 'error';

export const INTRO_CARD_FEATURE = 'intro-card';
export const INTRO_CARD_CHANGED_EVENT = 'marginalia:intro-card-changed';

const states = new Map<string, IntroCardState>();

export function getIntroCardState(bookId: string): IntroCardState | null {
  return states.get(bookId) ?? null;
}

function setState(bookId: string, state: IntroCardState): void {
  states.set(bookId, state);
  window.dispatchEvent(new CustomEvent(INTRO_CARD_CHANGED_EVENT, { detail: { bookId, state } }));
}

/** Generate and store the card for a freshly added book. Never throws; the outcome is the returned state. */
export async function prepareIntroCard(bookId: string): Promise<IntroCardState> {
  if (states.get(bookId) === 'pending') return 'pending';
  setState(bookId, 'pending');
  try {
    if (await getAiBlock(bookId, INTRO_CARD_FEATURE)) { setState(bookId, 'ready'); return 'ready'; }

    let full = '';
    let failure: Error | null = null;
    await MarginaliaAI.generate({
      featureId: INTRO_CARD_FEATURE,
      bookId,
      onChunk: (delta) => { full += delta; },
      onError: (err) => { failure = err; },
    });
    if (failure) {
      const quota = (failure as Error & { code?: string }).code === AI_QUOTA_EXCEEDED;
      if (!quota) logError(failure, { context: 'intro-card auto generate', bookId });
      setState(bookId, quota ? 'quota' : 'error');
      return quota ? 'quota' : 'error';
    }
    await saveAiOriginal(bookId, INTRO_CARD_FEATURE, parseModelJson(full), '1');
    setState(bookId, 'ready');
    return 'ready';
  } catch (err) {
    logError(err, { context: 'intro-card auto generate', bookId });
    setState(bookId, 'error');
    return 'error';
  }
}
