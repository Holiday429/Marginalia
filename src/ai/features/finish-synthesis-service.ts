/* Marginalia · finish card generation (plan 2.3). Used by the ritual and by the "Generate card" button
   on the Notes tab. The reader's answers are sent as params; the server builds the prompt. */

import { MarginaliaAI, AI_QUOTA_EXCEEDED } from '../../services/ai-gateway.ts';
import { logError } from '../../services/analytics.ts';
import { FinishCardSchema, type FinishAnswers, type FinishCard } from '../../data/schema/moment.ts';
import { parseModelJson } from './parse-model-json.ts';

export type FinishCardResult = { ok: true; card: FinishCard } | { ok: false; reason: 'quota' | 'error' };

export async function generateFinishCard(bookId: string, answers: FinishAnswers): Promise<FinishCardResult> {
  let text = '';
  let failure: Error | null = null;
  await MarginaliaAI.generate({
    featureId: 'finish-synthesis',
    bookId,
    params: { belief: answers.belief, intention: answers.intention, next: answers.next },
    onChunk: (delta) => { text += delta; },
    onError: (err) => { failure = err; },
  });
  if (failure) {
    const quota = (failure as Error & { code?: string }).code === AI_QUOTA_EXCEEDED;
    if (!quota) logError(failure, { context: 'finish card generate', bookId });
    return { ok: false, reason: quota ? 'quota' : 'error' };
  }
  try {
    return { ok: true, card: FinishCardSchema.parse(parseModelJson(text)) };
  } catch (err) {
    logError(err, { context: 'finish card parse', bookId });
    return { ok: false, reason: 'error' };
  }
}
