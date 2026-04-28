/* ==========================================================================
   Marginalia · Book Type Registry
   --------------------------------------------------------------------------
   Each entry defines the default panel set and default AI features for a
   book type. Individual books can override both via their own data file.

   To add a new type:
     1. Add an entry here — that's it.
     2. Optionally add type-specific prompt templates in src/ai/features/.

   Panel ids must exist in src/book/panels/registry.js.
   AI feature ids must exist in src/ai/features/registry.js.
   ========================================================================== */

window.BOOK_TYPES = {

  fiction: {
    label: 'Fiction',
    description: 'Novels, short stories, literary fiction',
    defaultPanels: ['overview', 'highlights', 'notes', 'characters', 'timeline', 'claude-import'],
    defaultAiFeatures: ['character-map', 'timeline-gen'],
  },

  nonfiction: {
    label: 'Nonfiction',
    description: 'Science, history, biography',
    defaultPanels: ['overview', 'highlights', 'notes', 'mindmap', 'concept-cards', 'actions', 'claude-import'],
    defaultAiFeatures: ['mindmap-gen', 'concept-cards', 'action-suggest'],
  },

  social: {
    label: 'Social Science',
    description: 'Sociology, philosophy, gender studies, economics',
    defaultPanels: ['overview', 'highlights', 'notes', 'concept-cards', 'actions', 'claude-import'],
    defaultAiFeatures: ['concept-cards', 'argument-breakdown', 'action-suggest'],
  },

  travel: {
    label: 'Travel',
    description: 'Travel writing, place-based narrative, cultural reportage',
    defaultPanels: ['overview', 'highlights', 'notes', 'geo-context', 'actions', 'claude-import'],
    defaultAiFeatures: ['geo-context', 'action-suggest'],
  },

  essay: {
    label: 'Essay / Self-help',
    description: 'Personal essays, self-help, life writing',
    defaultPanels: ['overview', 'highlights', 'notes', 'concept-cards', 'actions', 'claude-import'],
    defaultAiFeatures: ['action-suggest', 'argument-breakdown'],
  },

};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/**
 * Resolve the effective panel list for a book.
 * Book-level `panels` field overrides the type default entirely.
 * @param {object} book
 * @returns {string[]}
 */
window.BookTypes = {
  getPanels(book) {
    if (Array.isArray(book.panels) && book.panels.length) return book.panels;
    const type = window.BOOK_TYPES[book.bookType];
    return type ? type.defaultPanels : ['overview', 'highlights', 'notes', 'claude-import'];
  },

  getAiFeatures(book) {
    if (Array.isArray(book.aiFeatures) && book.aiFeatures.length) return book.aiFeatures;
    const type = window.BOOK_TYPES[book.bookType];
    return type ? type.defaultAiFeatures : [];
  },

  getTypeLabel(bookType) {
    return window.BOOK_TYPES[bookType]?.label || 'General';
  },

  /** All registered type ids, in display order. */
  all() {
    return Object.keys(window.BOOK_TYPES);
  },
};
