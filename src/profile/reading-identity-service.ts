import { resolveReadingIdentityResult } from './reading-identity-adapter.ts';
import { READING_IDENTITY_MOCK } from './reading-identity-mock.ts';
import type { ReadingIdentityResult } from './reading-identity-types.ts';

/**
 * Temporary local source for Reading Identity.
 * When the AI pipeline is wired, this module should become the only place that
 * knows how to read or regenerate the persisted result.
 */
export function getReadingIdentityResult(seed: ReadingIdentityResult = READING_IDENTITY_MOCK): ReadingIdentityResult {
  return resolveReadingIdentityResult(seed);
}
