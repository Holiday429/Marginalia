/* ==========================================================================
   Marginalia · Book Type Registry
   --------------------------------------------------------------------------
   Each entry defines the default panel set and default AI features for a
   book type. Individual books can override both via their own data file.

   To add a new type:
     1. Add an entry here — that's it.
     2. Optionally add type-specific prompt templates in src/ai/features/.

   Panel ids must exist in src/book/panels/registry.ts.
   AI feature ids must exist in src/ai/features/registry.ts.
   ========================================================================== */

export interface BookTypeDefinition {
  label: string;
  description: string;
  defaultPanels: string[];
  defaultAiFeatures: string[];
}

type Book = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- merged from inconsistent seed/store/cloud sources

export const BOOK_TYPES: Record<string, BookTypeDefinition> = {

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

export const BookTypes = {
  /** Resolve the effective panel list for a book. Book-level `panels` field overrides the type default entirely. */
  getPanels(book: Book): string[] {
    if (Array.isArray(book.panels) && book.panels.length) return book.panels;
    const type = BOOK_TYPES[book.bookType];
    return type ? type.defaultPanels : ['overview', 'highlights', 'notes', 'actions'];
  },

  getAiFeatures(book: Book): string[] {
    if (Array.isArray(book.aiFeatures) && book.aiFeatures.length) return book.aiFeatures;
    const type = BOOK_TYPES[book.bookType];
    return type ? type.defaultAiFeatures : [];
  },

  getTypeLabel(bookType: string): string {
    return BOOK_TYPES[bookType]?.label || 'General';
  },

  /** All registered type ids, in display order. */
  all(): string[] {
    return Object.keys(BOOK_TYPES);
  },
};
