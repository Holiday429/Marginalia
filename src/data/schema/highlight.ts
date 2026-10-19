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
  // Spaced resurface (plan 2.4); see shared/resurface.ts. Written when a highlight is first saved.
  resurface7At:   z.number().optional(),
  resurface30At:  z.number().optional(),
  resurface90At:  z.number().optional(),
  resurfaced7:    z.boolean().optional(),
  resurfaced30:   z.boolean().optional(),
  resurfaced90:   z.boolean().optional(),
  resurfaceRating:      z.enum(['resonates', 'thought', 'action', 'dismiss']).optional(),
  resurfaceRespondedAt: z.number().optional(),
  lastSurfacedAt:       z.number().optional(),
}).passthrough();

export type Highlight = z.infer<typeof HighlightSchema>;
