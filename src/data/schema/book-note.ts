// Marginalia · BookNote document schema
// Firestore: workspaces/{ws}/users/{uid}/books/{bookId}/notes/main
import { z } from 'zod';

export const BookNoteSchema = z.object({
  content:   z.string(),
  updatedAt: z.unknown().optional(), // FieldValue
}).passthrough();

export type BookNote = z.infer<typeof BookNoteSchema>;
