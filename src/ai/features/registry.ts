/* ==========================================================================
   Marginalia · AI Feature Registry
   --------------------------------------------------------------------------
   Each entry maps an AI feature id to the panel it populates, a display
   label, and a prompt loader function.

   To add a new AI feature:
     1. Add an entry here.
     2. Add the prompt builder to shared/ai-prompts/{id}.ts and register it in
        shared/ai-prompts/index.ts (the server-side whitelist; the client never sends prompts).

   The feature is only offered to the user if the book's effective
   aiFeatures[] list (resolved via BookTypes.getAiFeatures) includes the id.
   ========================================================================== */

import { BookTypes } from '../../data/schema/book-types.ts';

type Book = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- merged from inconsistent seed/store/cloud sources

interface AiFeatureDef {
  label: string;
  panel: string;
  outputType: string;
  profileFeature?: boolean;
}

export const AIFeatureRegistry = (() => {
  const _features: Record<string, AiFeatureDef> = {

    /* ── Fiction ──────────────────────────────────────────────────────────── */

    'character-map': {
      label: 'Generate character map',
      panel: 'characters',
      outputType: 'json',   // rendered by the panel as interactive nodes
    },

    'timeline-gen': {
      label: 'Generate timeline',
      panel: 'timeline',
      outputType: 'json',
    },

    /* ── Nonfiction / Science ─────────────────────────────────────────────── */

    'mindmap-gen': {
      label: 'Generate mind map',
      panel: 'mindmap',
      outputType: 'json',
    },

    'concept-cards': {
      label: 'Generate concept cards',
      panel: 'concept-cards',
      outputType: 'json',
    },

    /* ── Social Science ───────────────────────────────────────────────────── */

    'argument-breakdown': {
      label: 'Break down core arguments',
      panel: 'concept-cards',
      outputType: 'json',
    },

    /* ── Travel ───────────────────────────────────────────────────────────── */

    'geo-context': {
      label: 'Generate geographic & cultural context',
      panel: 'geo-context',
      outputType: 'json',
    },

    /* ── Essay / Self-help ────────────────────────────────────────────────── */

    'action-suggest': {
      label: 'Suggest action items',
      panel: 'actions',
      outputType: 'json',
    },

    /* ── Overview / Export ───────────────────────────────────────────────── */

    'reading-card': {
      label: 'Generate reading card',
      panel: 'overview',
      outputType: 'json',
    },

    /* ── Profile ──────────────────────────────────────────────────────────── */

    'reader-portrait': {
      label: 'Generate reader portrait',
      panel: 'reader-portrait',
      outputType: 'json',
      profileFeature: true,
    },

    'reader-identity': {
      label: 'Generate reading identity',
      panel: 'reader-identity',
      outputType: 'json',
      profileFeature: true,
    },

  };

  return {
    /** Get feature config by id. */
    get(id: string): AiFeatureDef | null {
      return _features[id] || null;
    },

    /** Resolve the active AI features for a book. */
    forBook(book: Book): Array<{ id: string } & Partial<AiFeatureDef>> {
      const ids = BookTypes.getAiFeatures(book);
      return ids
        .map(id => ({ id, ...(_features[id] || {}) }))
        .filter(f => f.label);
    },

    all(): string[] {
      return Object.keys(_features);
    },
  };
})();
