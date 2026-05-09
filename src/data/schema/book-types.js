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

export const BOOK_TYPES = {

  fiction: {
    label: 'Fiction',
    description: 'Novels, short stories, literary fiction',
    defaultPanels: ['overview', 'highlights', 'related-books', 'notes', 'actions'],
    defaultAiFeatures: ['character-map', 'timeline-gen'],
  },

  nonfiction: {
    label: 'Nonfiction',
    description: 'Science, history, biography',
    defaultPanels: ['overview', 'highlights', 'visual-notes', 'cultural-context', 'related-books', 'notes', 'actions'],
    defaultAiFeatures: ['mindmap-gen', 'concept-cards', 'action-suggest'],
  },

  social: {
    label: 'Social Science',
    description: 'Sociology, philosophy, gender studies, economics',
    defaultPanels: ['overview', 'highlights', 'visual-notes', 'cultural-context', 'related-books', 'notes', 'actions'],
    defaultAiFeatures: ['concept-cards', 'argument-breakdown', 'action-suggest'],
  },

  travel: {
    label: 'Travel',
    description: 'Travel writing, place-based narrative, cultural reportage',
    defaultPanels: ['overview', 'highlights', 'cultural-context', 'related-books', 'notes', 'actions'],
    defaultAiFeatures: ['geo-context', 'action-suggest'],
  },

  essay: {
    label: 'Essay / Self-help',
    description: 'Personal essays, self-help, life writing',
    defaultPanels: ['overview', 'highlights', 'related-books', 'notes', 'actions'],
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
export const BookTypes = {
  getPanels(book) {
    if (Array.isArray(book.panels) && book.panels.length) return book.panels;
    const type = BOOK_TYPES[book.bookType];
    return type ? type.defaultPanels : ['overview', 'highlights', 'notes', 'actions'];
  },

  getAiFeatures(book) {
    if (Array.isArray(book.aiFeatures) && book.aiFeatures.length) return book.aiFeatures;
    const type = BOOK_TYPES[book.bookType];
    return type ? type.defaultAiFeatures : [];
  },

  getTypeLabel(bookType) {
    return BOOK_TYPES[bookType]?.label || 'General';
  },

  /** All registered type ids, in display order. */
  all() {
    return Object.keys(BOOK_TYPES);
  },
};
