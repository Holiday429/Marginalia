// Marginalia · picture-frame photo.
// The desk picture frame shows the signed-in user's avatar; signed-out visitors and users without
// an avatar get the pixel reader. Pure state + subscriptions so room.ts and frame-fly.js share it.

import { asset } from '../core/asset.ts';

const DEFAULT_PHOTO = asset('3d/frame-photo-default.png');

let custom: string | null = null;
const listeners = new Set<() => void>();

export function getFramePhotoUrl(): string {
  return custom || DEFAULT_PHOTO;
}

/** Pass the user's avatar (data/https URL) or null to fall back to the pixel reader. */
export function setFramePhotoUrl(url: string | null | undefined): void {
  const next = url || null;
  if (next === custom) return;
  custom = next;
  listeners.forEach((fn) => fn());
}

export function onFramePhotoChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
