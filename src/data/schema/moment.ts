// Marginalia · Moment document schema (finish ritual, plan 2.3)
// Firestore: workspaces/{ws}/users/{uid}/moments/{bookId}   (doc id = bookId, one per book)
//
// state 'completed': the reader answered; `card` is the AI synthesis (absent if generation failed or
//   hit the quota — the answers are kept so the card can be generated later).
// state 'skipped':   the reader dismissed the ritual. Kept so it is never offered again for this book.
import { z } from 'zod';
import { AiBlockSchema } from './ai-block.ts';

export const FinishCardSchema = z.object({
  headline:  z.string(),
  synthesis: z.string(),
  tags:      z.array(z.string()).default([]),
});

export const FinishAnswersSchema = z.object({
  belief:    z.string().max(400).default(''),
  intention: z.string().max(400).default(''),
  next:      z.string().max(400).default(''),
});

export const MomentSchema = z.object({
  bookId:     z.string().min(1),
  kind:       z.literal('finish'),
  state:      z.enum(['completed', 'skipped']),
  answers:    FinishAnswersSchema.optional(),
  /** AiBlock<FinishCard>: views render `userEdited ?? original`. */
  card:       AiBlockSchema.optional(),
  finishedAt: z.number().optional(),
}).passthrough();

export type FinishCard = z.infer<typeof FinishCardSchema>;
export type FinishAnswers = z.infer<typeof FinishAnswersSchema>;
export type Moment = z.infer<typeof MomentSchema>;
