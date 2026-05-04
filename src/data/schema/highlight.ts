// Marginalia · Highlight document schema (Firestore: .../books/{bookId}/highlights/{highlightId})
import { z } from 'zod';

export const HighlightSchema = z.object({
  id:        z.string(),
  bookId:    z.string(),
  quote:     z.string().min(1),
  page:      z.number().nullable().optional(),
  chapter:   z.string().nullable().optional(),
  kind:      z.enum(['highlight', 'note', 'bookmark', 'concept']).nullable().optional(),
  source:    z.enum(['manual', 'kindle', 'notion', 'apple-books']).default('manual'),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
}).passthrough();

export type Highlight = z.infer<typeof HighlightSchema>;
