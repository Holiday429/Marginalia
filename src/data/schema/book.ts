// Marginalia · Book document schema (Firestore: workspaces/{ws}/users/{uid}/books/{bookId})
import { z } from 'zod';

export const BookCoverSchema = z.object({
  image:       z.string().optional(),
  storagePath: z.string().optional(),
}).passthrough();

export const BookSchema = z.object({
  cover:     BookCoverSchema.optional(),
  status:    z.enum(['unread', 'reading', 'read', 'abandoned']).optional(),
  startedAt: z.number().nullable().optional(),
  finishedAt: z.number().nullable().optional(),
  updatedAt:  z.unknown().optional(), // FieldValue or number
}).passthrough();

export type Book = z.infer<typeof BookSchema>;
