// Marginalia · Action document schema
// Firestore: users/{uid}/data/actions/{actionId}
// Per-book knowledge-conversion task (see ADR 0007).
import { z } from 'zod';

export const ActionStatusSchema = z.enum(['open', 'done', 'snoozed', 'archived']);

export const ActionSchema = z.object({
  bookId:    z.string(),
  text:      z.string().min(1),
  status:    ActionStatusSchema,
  createdAt: z.number(),

  // Reminder tier timestamps (epoch ms). Set on create; reset on snooze.
  remind7At:  z.number().optional(),
  remind30At: z.number().optional(),
  remind90At: z.number().optional(),

  // Whether each reminder has already fired. Prevents duplicate notifications.
  reminded7:  z.boolean().optional(),
  reminded30: z.boolean().optional(),
  reminded90: z.boolean().optional(),

  // Set when status transitions to 'done' or 'archived'.
  resolvedAt: z.number().nullable().optional(),
}).passthrough();

export type Action = z.infer<typeof ActionSchema>;
export type ActionStatus = z.infer<typeof ActionStatusSchema>;
