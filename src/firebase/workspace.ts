// Marginalia · the active Firestore workspace id.
// One definition for the whole client (it used to be re-derived in 20 places with two different
// fallbacks). Production sets VITE_WORKSPACE_ID; the fallback matches .env.example.

import { ENV } from '../core/env.ts';
import { DEFAULT_WORKSPACE_ID } from './paths.ts';

export function getWorkspaceId(): string {
  return ENV.WORKSPACE_ID || DEFAULT_WORKSPACE_ID;
}
