// Marginalia · AiBlock<T> — wrapper for all AI-generated content in Firestore.
// Views always render `userEdited ?? original`. Storing both lets users edit
// without losing the original generation, and regenerate without losing their edit.
import { z } from 'zod';

export type AiBlock<T> = {
  original: T;
  userEdited?: T;
  generatedAt: number;   // ms timestamp
  promptVersion: string; // from the prompt file's `version` export
};

// Zod schema for persistence validation. T is validated at the feature level.
export const AiBlockSchema = z.object({
  original:      z.unknown(),
  userEdited:    z.unknown().optional(),
  generatedAt:   z.number(),
  promptVersion: z.string(),
});

export type AiBlockRaw = z.infer<typeof AiBlockSchema>;

/** Return the value a view should display: user edit takes precedence. */
export function resolveAiContent<T>(block: AiBlock<T>): T {
  return block.userEdited !== undefined ? block.userEdited : block.original;
}
