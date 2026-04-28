/* ==========================================================================
   Marginalia · AI Feature Registry
   --------------------------------------------------------------------------
   Each entry maps an AI feature id to the panel it populates, a display
   label, and a prompt loader function.

   To add a new AI feature:
     1. Add an entry here.
     2. Create src/ai/features/prompts/{id}.js that sets
          window.AI_PROMPTS['{id}'] = { build(book) { return promptString; } }
     3. Load that script in index.html.

   The feature is only offered to the user if the book's effective
   aiFeatures[] list (resolved via BookTypes.getAiFeatures) includes the id.
   ========================================================================== */

window.AIFeatureRegistry = (() => {
  const _features = {

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

  };

  /* ── Prompt store (populated by individual prompt files) ─────────────── */
  const _prompts = {};

  return {
    /**
     * Register a prompt builder for a feature.
     * Called by src/ai/features/prompts/{id}.js.
     * @param {string} id
     * @param {{ build(book): string }} promptObj
     */
    setPrompt(id, promptObj) {
      _prompts[id] = promptObj;
    },

    /** Get feature config by id. */
    get(id) {
      return _features[id] || null;
    },

    /**
     * Build the prompt string for a given feature + book.
     * Returns null if the prompt file hasn't loaded yet.
     * @param {string} featureId
     * @param {object} book
     * @returns {string|null}
     */
    buildPrompt(featureId, book) {
      const feature = _features[featureId];
      if (!feature) return null;
      const promptObj = _prompts[feature.promptId];
      if (!promptObj) {
        console.warn(`[AIFeatureRegistry] Prompt not loaded for "${featureId}"`);
        return null;
      }
      return promptObj.build(book);
    },

    /**
     * Resolve the active AI features for a book.
     * @param {object} book
     * @returns {Array<{id, label, panel, outputType}>}
     */
    forBook(book) {
      const ids = window.BookTypes.getAiFeatures(book);
      return ids
        .map(id => ({ id, ...(_features[id] || {}) }))
        .filter(f => f.label);
    },

    all() {
      return Object.keys(_features);
    },
  };
})();
