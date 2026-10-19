// Marginalia · AI prompt registry (server side).
// Single whitelist of AI features. The Cloud Function accepts only these featureIds and assembles
// the prompt itself; the client sends { featureId, bookId? } and never prompt text.

import type { BookCtx, LibraryCtx } from './types';
import { buildActionSuggestPrompt } from './action-suggest';
import { buildArgumentBreakdownPrompt } from './argument-breakdown';
import { buildCharacterMapPrompt } from './character-map';
import { buildConceptCardsPrompt } from './concept-cards';
import { buildGeoContextPrompt } from './geo-context';
import { buildIntroCardPrompt } from './intro-card';
import { buildMindmapGenPrompt } from './mindmap-gen';
import { buildReaderIdentityPrompt } from './reader-identity';
import { buildReaderPortraitPrompt } from './reader-portrait';
import { buildReadingCardPrompt } from './reading-card';
import { buildTimelineGenPrompt } from './timeline-gen';

export type { BookCtx, LibraryCtx };

export interface PromptCtx {
  book: BookCtx;
  library: LibraryCtx;
  notes?: string;
}

export const AI_FEATURES = {
  'action-suggest': { kind: 'book', build: (c: PromptCtx) => buildActionSuggestPrompt(c.book) },
  'argument-breakdown': { kind: 'book', build: (c: PromptCtx) => buildArgumentBreakdownPrompt(c.book) },
  'character-map': { kind: 'book', build: (c: PromptCtx) => buildCharacterMapPrompt(c.book) },
  'concept-cards': { kind: 'book', build: (c: PromptCtx) => buildConceptCardsPrompt(c.book) },
  'geo-context': { kind: 'book', build: (c: PromptCtx) => buildGeoContextPrompt(c.book) },
  'intro-card': { kind: 'book', build: (c: PromptCtx) => buildIntroCardPrompt(c.book) },
  'mindmap-gen': { kind: 'book', build: (c: PromptCtx) => buildMindmapGenPrompt(c.book) },
  'reader-identity': { kind: 'library', build: (c: PromptCtx) => buildReaderIdentityPrompt(c.library) },
  'reader-portrait': { kind: 'library', build: (c: PromptCtx) => buildReaderPortraitPrompt(c.library) },
  'reading-card': { kind: 'book', build: (c: PromptCtx) => buildReadingCardPrompt(c.book, { notes: c.notes }) },
  'timeline-gen': { kind: 'book', build: (c: PromptCtx) => buildTimelineGenPrompt(c.book) },
} as const;

export type AiFeatureId = keyof typeof AI_FEATURES;

export function isAiFeatureId(value: unknown): value is AiFeatureId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(AI_FEATURES, value);
}

/** Hard caps applied to user data before it is placed in a prompt. */
export const PROMPT_LIMITS = {
  highlights: 60,
  quoteChars: 600,
  fieldChars: 2000,
  actions: 30,
  libraryBooks: 60,
  librarySample: 20,
  notesChars: 4000,
  promptChars: 30000,
} as const;
