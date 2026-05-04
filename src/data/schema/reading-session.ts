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
}).passthrough();

export type ReadingSession = z.infer<typeof ReadingSessionSchema>;
