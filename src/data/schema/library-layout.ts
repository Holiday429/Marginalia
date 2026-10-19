// Marginalia · Library layout document schema
// Firestore: workspaces/{wsId}/users/{uid}/data/library_layout
// Shelf positions and which book sits on which shelf (drag-to-arrange state).
import { z } from 'zod';

export const LibraryLayoutShelfSchema = z.object({
  id:       z.string().min(1),
  name:     z.string(),
  rows:     z.number(),
  color:    z.string(),
  viewMode: z.string(),
  status:   z.string().optional(),
  x:        z.number(),
  y:        z.number(),
  tilt:     z.number().optional(),
  pitch:    z.number().optional(),
  yaw:      z.number().optional(),
  bookKeys: z.array(z.string()),
}).passthrough();

export const LibraryLayoutSchema = z.object({
  shelves: z.array(LibraryLayoutShelfSchema),
  view: z.object({ x: z.number(), y: z.number(), scale: z.number() }),
  camera: z.object({ yaw: z.number(), pitch: z.number() }).optional(),
  sceneMode: z.string().optional(),
  bookStatus: z.record(z.string(), z.string()).optional(),
}).passthrough();

export type LibraryLayout = z.infer<typeof LibraryLayoutSchema>;
