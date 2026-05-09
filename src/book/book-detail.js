/* ==========================================================================
   Marginalia · Book detail section model
   --------------------------------------------------------------------------
   Normalises legacy panel ids and raw book shapes into one stable section
   contract for the book detail view.
   ========================================================================== */

import { BookTypes } from '../data/schema/book-types.js';

export const BOOK_SECTION_ORDER = [
  'overview',
  'highlights',
  'visual-notes',
  'cultural-context',
  'related-books',
  'notes',
  'actions',
];

export const BOOK_SECTION_LABELS = {
  overview: 'Overview',
  highlights: 'Highlights',
  'visual-notes': 'Visual Notes',
  'cultural-context': 'Cultural Context',
  'related-books': 'Related Books',
  notes: 'Notes',
  actions: 'Actions',
};

const LEGACY_SECTION_ALIASES = {
  overview: 'overview',
  conclusion: 'overview',
  highlights: 'highlights',
  mindmap: 'visual-notes',
  'claude-import': 'visual-notes',
  'visual-notes': 'visual-notes',
  cultural: 'cultural-context',
  'geo-context': 'cultural-context',
  'concept-cards': 'cultural-context',
  context: 'notes',
  notes: 'notes',
  related: 'related-books',
  'related-books': 'related-books',
  actions: 'actions',
};

const CORE_SECTIONS = new Set(['overview', 'highlights', 'notes', 'actions']);

export function buildBookDetailModel(rawBook) {
  const book = normalizeBook(rawBook);
  const sections = resolveSections(rawBook, book);
  return { ...book, sections };
}

function normalizeBook(rawBook) {
  const book = { ...rawBook };
  const insight = book.insight || {};
  const context = book.context || {};

  return {
    ...book,
    summary: book.summary || insight.integration || insight.oneLiner || '',
    culturalContext: Array.isArray(book.cultural) ? book.cultural : [],
    relatedBooks: Array.isArray(book.connections) ? book.connections : [],
    readingContextBlocks: [
      context.place ? { label: 'Reading place', body: context.place } : null,
      context.mood ? { label: 'Reading mood', body: context.mood, tags: context.moodTags || [] } : null,
      context.life ? { label: 'Life context', body: context.life, tags: context.lifeTags || [] } : null,
    ].filter(Boolean),
  };
}

function resolveSections(rawBook, book) {
  const configured = new Set(resolveConfiguredSectionIds(rawBook));
  CORE_SECTIONS.forEach((id) => configured.add(id));

  return BOOK_SECTION_ORDER
    .filter((id) => configured.has(id))
    .filter((id) => shouldRenderSection(id, book));
}

function resolveConfiguredSectionIds(book) {
  const sourceIds = Array.isArray(book.panels) && book.panels.length
    ? book.panels
    : BookTypes.getPanels(book);

  const ids = sourceIds
    .map((id) => LEGACY_SECTION_ALIASES[id] || id)
    .filter((id) => BOOK_SECTION_LABELS[id]);

  return Array.from(new Set(ids));
}

function shouldRenderSection(id, book) {
  if (CORE_SECTIONS.has(id)) return true;

  if (id === 'visual-notes') {
    return Boolean(book.mindmap || wantsSection(book, id));
  }

  if (id === 'cultural-context') {
    return Boolean(book.culturalContext.length || wantsSection(book, id));
  }

  if (id === 'related-books') {
    return Boolean(book.relatedBooks.length || wantsSection(book, id));
  }

  return false;
}

function wantsSection(book, id) {
  const configured = Array.isArray(book.panels) && book.panels.length
    ? book.panels
    : BookTypes.getPanels(book);

  return configured
    .map((panelId) => LEGACY_SECTION_ALIASES[panelId] || panelId)
    .includes(id);
}
