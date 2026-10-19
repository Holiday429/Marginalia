// Marginalia · URLs of optimized 3D models and surface textures.
// The hashed file names come from scripts/optimize-assets.mjs (asset-manifest.generated.ts).

import { asset } from '../core/asset.ts';
import { MODEL_PATHS, TEXTURE_PATHS } from './asset-manifest.generated.ts';

export type ModelName = keyof typeof MODEL_PATHS;
export type TextureKey = keyof typeof TEXTURE_PATHS;

export function modelUrl(name: ModelName): string {
  return asset(MODEL_PATHS[name]);
}

export function textureUrl(key: TextureKey): string {
  return asset(TEXTURE_PATHS[key]);
}
