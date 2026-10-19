// Marginalia · ReadingSession document schema (Firestore: .../books/{bookId}/sessions/{sessionId})
// Stub — sessions are not yet written by the client (P1 feature). Schema declared here
// so the write path is validated from day one when sessions are implemented.
import { z } from 'zod';

export const ReadingSessionSchema = z.object({
  bookId:     z.string(),
  startedAt:  z.number(),
  endedAt:    z.number().nullable().optional(),
  durationMs: z.number().nullable().optional(),
  endPage:    z.number().nullable().optional(),
  // City-level place, only when the reader allowed it (plan 2.6)
  place:      z.object({ country: z.string(), city: z.string().nullable() }).optional(),
}).passthrough();

export type ReadingSession = z.infer<typeof ReadingSessionSchema>;
