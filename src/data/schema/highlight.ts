// Marginalia · Highlight document schema
// Firestore: workspaces/{ws}/users/{uid}/highlights/{highlightId}  (flat; bookId is a field)
import { z } from 'zod';

export const HighlightSchema = z.object({
  id:        z.string(),
  bookId:    z.string(), // '' = a quick capture not yet attributed to a book (plan 2.1)
  quote:     z.string().min(1),
  page:      z.number().nullable().optional(),
  chapter:   z.string().nullable().optional(),
  kind:      z.enum(['highlight', 'note', 'bookmark', 'concept', 'argument', 'critique', 'action']).nullable().optional(),
  source:    z.enum(['manual', 'quick', 'kindle', 'notion', 'apple-books']).default('manual'),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
}).passthrough();

export type Highlight = z.infer<typeof HighlightSchema>;
