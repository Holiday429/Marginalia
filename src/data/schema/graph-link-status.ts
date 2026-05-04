// Marginalia · GraphLinkStatus document schema
// Firestore: workspaces/{ws}/users/{uid}/graph/linkStatus
import { z } from 'zod';

export const GraphLinkStatusSchema = z.object({
  overrides: z.record(z.string(), z.unknown()).optional(),
  updatedAt: z.unknown().optional(), // FieldValue
}).passthrough();

export type GraphLinkStatus = z.infer<typeof GraphLinkStatusSchema>;
