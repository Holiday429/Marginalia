/* ==========================================================================
   Marginalia · AI Feature Registry
   --------------------------------------------------------------------------
   Each entry maps an AI feature id to the panel it populates, a display
   label, and a prompt loader function.

   To add a new AI feature:
     1. Add an entry here.
     2. Create src/ai/features/prompts/{id}.js that calls
          AIFeatureRegistry.setPrompt('{id}', { build(book) { return promptString; } })
     3. Import the script as a side effect in src/main.js.

   The feature is only offered to the user if the book's effective
   aiFeatures[] list (resolved via BookTypes.getAiFeatures) includes the id.
   ========================================================================== */

import { logError } from '../../services/analytics.ts';
import { BookTypes } from '../../data/schema/book-types.ts';

type Book = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- merged from inconsistent seed/store/cloud sources

interface AiFeatureDef {
  label: string;
  panel: string;
  outputType: string;
  promptId: string;
  profileFeature?: boolean;
}

interface PromptObj {
  build(book: Book): string;
}

export const AIFeatureRegistry = (() => {
  const _features: Record<string, AiFeatureDef> = {

    /* ── Fiction ──────────────────────────────────────────────────────────── */

    'character-map': {
      label: 'Generate character map',
      panel: 'characters',
      outputType: 'json',   // rendered by the panel as interactive nodes
      promptId: 'character-map',
    },

    'timeline-gen': {
      label: 'Generate timeline',
      panel: 'timeline',
      outputType: 'json',
      promptId: 'timeline-gen',
    },

    /* ── Nonfiction / Science ─────────────────────────────────────────────── */

    'mindmap-gen': {
      label: 'Generate mind map',
      panel: 'mindmap',
      outputType: 'json',
      promptId: 'mindmap-gen',
    },

    'concept-cards': {
      label: 'Generate concept cards',
      panel: 'concept-cards',
      outputType: 'json',
      promptId: 'concept-cards',
    },

    /* ── Social Science ───────────────────────────────────────────────────── */

    'argument-breakdown': {
      label: 'Break down core arguments',
      panel: 'concept-cards',
      outputType: 'json',
      promptId: 'argument-breakdown',
    },

    /* ── Travel ───────────────────────────────────────────────────────────── */

    'geo-context': {
      label: 'Generate geographic & cultural context',
      panel: 'geo-context',
      outputType: 'json',
      promptId: 'geo-context',
    },

    /* ── Essay / Self-help ────────────────────────────────────────────────── */

    'action-suggest': {
      label: 'Suggest action items',
      panel: 'actions',
      outputType: 'json',
      promptId: 'action-suggest',
    },

    /* ── Overview / Export ───────────────────────────────────────────────── */

    'reading-card': {
      label: 'Generate reading card',
      panel: 'overview',
      outputType: 'json',
      promptId: 'reading-card',
    },

    /* ── Profile ──────────────────────────────────────────────────────────── */

    'reader-portrait': {
      label: 'Generate reader portrait',
      panel: 'reader-portrait',
      outputType: 'json',
      promptId: 'reader-portrait',
      profileFeature: true,
    },

    'reader-identity': {
      label: 'Generate reading identity',
      panel: 'reader-identity',
      outputType: 'json',
      promptId: 'reader-identity',
      profileFeature: true,
    },

  };

  /* ── Prompt store (populated by individual prompt files) ─────────────── */
  const _prompts: Record<string, PromptObj> = {};

  return {
    /**
     * Register a prompt builder for a feature.
     * Called by src/ai/features/prompts/{id}.js.
     */
    setPrompt(id: string, promptObj: PromptObj): void {
      _prompts[id] = promptObj;
    },

    /** Get feature config by id. */
    get(id: string): AiFeatureDef | null {
      return _features[id] || null;
    },

    /**
     * Build the prompt string for a given feature + book.
     * Returns null if the prompt file hasn't loaded yet.
     */
    buildPrompt(featureId: string, book: Book): string | null {
      const feature = _features[featureId];
      if (!feature) return null;
      const promptObj = _prompts[feature.promptId];
      if (!promptObj) {
        logError(new Error(`[AIFeatureRegistry] Prompt not loaded for "${featureId}"`), { featureId });
        return null;
      }
      return promptObj.build(book);
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
