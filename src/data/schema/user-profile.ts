// Marginalia · UserProfile document schema
// Firestore: workspaces/{ws}/userProfiles/{uid}
import { z } from 'zod';

export const UserProfileSchema = z.object({
  uid:           z.string(),
  username:      z.string(),
  usernameLower: z.string(),
  email:         z.string(),
  photoURL:      z.string().optional(),
  updatedAt:     z.unknown().optional(), // FieldValue or number
  createdAt:     z.unknown().optional(), // FieldValue — only on first write
}).passthrough();

export type UserProfile = z.infer<typeof UserProfileSchema>;
