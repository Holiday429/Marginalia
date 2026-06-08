import { resolveReadingIdentityResult } from './reading-identity-adapter.ts';
import type { ReadingIdentityResult } from './reading-identity-types.ts';

export function getReadingIdentityResult(seed: ReadingIdentityResult): ReadingIdentityResult {
  return resolveReadingIdentityResult(seed);
}
