/* ==========================================================================
   Marginalia · Graph data facade
   --------------------------------------------------------------------------
   Cloud-ready graph layer that derives Concept / BookConceptLink /
   CulturalContext entities from the current static BOOK_DETAILS seed.
   Future Firebase sync should replace the seed adapter, not the view code.
   ========================================================================== */

import { logError } from '../services/analytics.ts';
import { BooksStore } from '../store/books-store.ts';
import { MarginaliaAuth } from '../firebase/auth.ts';
import { SEED_BOOK_DETAILS, SEED_BOOK_BY_ID } from '../data/seed/index.js';
import { NotesStore } from '../store/notes-store.ts';

// Book records come from three sources (BooksStore, seed data, ad-hoc AI
// imports) with inconsistent optional fields — matches the loose BookRecord
// shape already used in store/books-store.ts. Deep/nested field access below
// intentionally stays loosely typed rather than modeling every seed shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Book = Record<string, any>;

export type RelationType = 'core-thesis' | 'supports' | 'contrasts' | 'extends' | 'questions' | 'action-trigger';
export type LinkStatus = 'confirmed' | 'suggested' | 'rejected';

export interface RelationMeta {
  label: string;
  color: string;
  strength: number;
}

export interface StatusMeta {
  label: string;
  visible: boolean;
}

export interface Concept {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
  aliases: string[];
  searchText: string;
  bookIds: string[];
  contextIds: string[];
  bookCount?: number;
  totalStrength?: number;
  hasSuggested?: boolean;
}

export interface CulturalContext {
  id: string;
  label: string;
  description: string;
  searchText: string;
  bookIds: string[];
  conceptIds: string[];
  conceptCount?: number;
}

interface EvidenceHighlight {
  id: string;
  quote: string;
  chapter?: string;
  page?: number;
  annotation: string;
}

interface RelatedAction {
  id: string;
  text: string;
  status: string;
  tag: string;
}

export interface BookConceptLink {
  id: string;
  bookId: string;
  conceptId: string;
  contextId: string | null;
  relationType: RelationType;
  relationLabel: string;
  status: LinkStatus;
  strength: number;
  origin: string;
  rationale: string;
  readerUnderstanding: string;
  readAt: string;
  evidenceHighlights: EvidenceHighlight[];
  relatedActions: RelatedAction[];
  searchText: string;
}

interface GraphState {
  books: Book[];
  booksById: Record<string, Book>;
  concepts: Concept[];
  conceptsById: Record<string, Concept>;
  culturalContexts: CulturalContext[];
  contextsById: Record<string, CulturalContext>;
  bookConceptLinks: BookConceptLink[];
  linksById: Record<string, BookConceptLink>;
  statusOverrides: Record<string, LinkStatus>;
}

interface GraphSnapshotOptions {
  query?: string;
  mode?: 'all' | 'suggested';
  topConceptLimit?: number;
  focusConceptId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GraphNode = (Concept | Book | CulturalContext) & { type: 'concept' | 'book' | 'context'; weight: number; [key: string]: any };

interface GraphLink {
  id: string;
  source: string;
  target: string;
  linkType: 'book-concept' | 'context-concept';
  relationType: string;
  status: LinkStatus | 'confirmed';
  strength: number;
}

interface GraphSnapshot {
  nodes: GraphNode[];
  links: GraphLink[];
  concepts: Concept[];
  books: Book[];
  contexts: CulturalContext[];
  stats: {
    books: number;
    concepts: number;
    visibleConcepts: number;
    visibleLinks: number;
    suggestedLinks: number;
  };
}

export interface ConceptDetails {
  concept: Concept;
  relatedBooks: Array<{ link: BookConceptLink; book: Book; context: CulturalContext | null }>;
  relatedContexts: CulturalContext[];
}

interface BookRelatedConcept {
  link: BookConceptLink;
  concept: Concept;
  context: CulturalContext | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConceptSeed = Record<string, any>;

export const MarginaliaGraph = (() => {
  const STATUS_STORAGE_KEY = 'marginalia.bookConceptLink.status.v1';

  const RELATION_META: Record<RelationType, RelationMeta> = {
    'core-thesis':   { label: 'Core Thesis', color: '#d5aa64', strength: 1.0 },
    supports:        { label: 'Supports', color: '#87b6a7', strength: 0.8 },
    contrasts:       { label: 'Contrasts', color: '#b67d7d', strength: 0.74 },
    extends:         { label: 'Extends', color: '#7f97c6', strength: 0.72 },
    questions:       { label: 'Questions', color: '#c6945b', strength: 0.78 },
    'action-trigger':{ label: 'Action Trigger', color: '#d97b65', strength: 0.88 },
  };

  const STATUS_META: Record<LinkStatus, StatusMeta> = {
    confirmed: { label: 'Confirmed', visible: true },
    suggested: { label: 'AI suggested', visible: true },
    rejected:  { label: 'Rejected', visible: false },
  };

  let statusOverrideSource = 'local';
  let remoteStatusOverrides: Record<string, LinkStatus> | null = null;
  let persistStatusOverride: ((payload: { linkId: string; status: LinkStatus; overrides: Record<string, LinkStatus> }) => unknown) | null = null;
  let graphState: GraphState = buildGraphState();

  function buildGraphState(): GraphState {
    const auth = MarginaliaAuth;
    const isAuthenticated = Boolean(auth?.user);
    const books: Book[] = isAuthenticated
      ? BooksStore.getAll()
      : (BooksStore.getAll().length ? BooksStore.getAll() : SEED_BOOK_DETAILS);
    const statusOverrides = getStatusOverrides();
    const conceptsById = new Map<string, Concept>();
    const contextsById = new Map<string, CulturalContext>();
    const bookConceptLinks: BookConceptLink[] = [];

    books.forEach((book) => {
      getBookConceptSeeds(book).forEach((seed, index) => {
        const conceptId = seed.id || slugify(seed.name || `${book.id}-concept-${index}`);
        const contextId = seed.contextTag ? `context-${slugify(seed.contextTag)}` : null;
        const linkId = `${book.id}__${conceptId}`;
        const status: LinkStatus = statusOverrides[linkId] || seed.status || 'confirmed';
        const relationType: RelationType = RELATION_META[seed.relationType as RelationType] ? seed.relationType : 'supports';
        const relationMeta = RELATION_META[relationType];
        const conceptName = String(seed.name || '').trim() || 'Untitled concept';
        const description = seed.description || seed.body || '';
        const searchText = [
          conceptName,
          ...(seed.aliases || []),
          description,
          seed.contextTag || '',
          seed.rationale || '',
        ].join(' ').toLowerCase();

        const concept: Concept = conceptsById.get(conceptId) || {
          id: conceptId,
          name: conceptName,
          shortLabel: seed.shortLabel || conceptName,
          description,
          aliases: [...(seed.aliases || [])],
          searchText,
          bookIds: [],
          contextIds: [],
        };
        if (!concept.description && description) concept.description = description;
        concept.shortLabel = concept.shortLabel || concept.name;
        concept.searchText = [concept.searchText, searchText].join(' ').trim();
        appendUnique(concept.aliases, ...(seed.aliases || []));
        appendUnique(concept.bookIds, book.id);
        if (contextId) appendUnique(concept.contextIds, contextId);
        conceptsById.set(conceptId, concept);

        if (contextId) {
          const context: CulturalContext = contextsById.get(contextId) || {
            id: contextId,
            label: seed.contextTag,
            description: seed.contextDescription || lookupContextDescription(book, seed.contextTag) || '',
            searchText: `${seed.contextTag} ${seed.contextDescription || ''}`.toLowerCase(),
            bookIds: [],
            conceptIds: [],
          };
          if (!context.description) {
            context.description = lookupContextDescription(book, seed.contextTag) || context.description;
          }
          appendUnique(context.bookIds, book.id);
          appendUnique(context.conceptIds, conceptId);
          contextsById.set(contextId, context);
        }

        const evidenceHighlights: EvidenceHighlight[] = (seed.highlightIds || [])
          .map((highlightId: string) => book.highlights?.find((item: Book) => String(item.id) === String(highlightId)))
          .filter(Boolean)
          .map((item: Book) => ({
            id: item.id,
            quote: item.quote,
            chapter: item.chapter,
            page: item.page,
            annotation: item.annotation || '',
          }));

        const relatedActions: RelatedAction[] = (seed.actionIds || [])
          .map((actionId: string) => book.actions?.find((item: Book) => item.id === actionId))
          .filter(Boolean)
          .map((item: Book) => ({
            id: item.id,
            text: item.text,
            status: item.status,
            tag: item.tag || '',
          }));

        bookConceptLinks.push({
          id: linkId,
          bookId: book.id,
          conceptId,
          contextId,
          relationType,
          relationLabel: relationMeta.label,
          status,
          strength: seed.strength || relationMeta.strength,
          origin: seed.origin || (status === 'suggested' ? 'ai' : 'reader'),
          rationale: seed.rationale || '',
          readerUnderstanding: seed.readerUnderstanding || '',
          readAt: book.meta?.finishedAt || book.meta?.startedAt || '',
          evidenceHighlights,
          relatedActions,
          searchText: [
            conceptName,
            description,
            seed.readerUnderstanding || '',
            seed.rationale || '',
            evidenceHighlights.map((item) => `${item.quote} ${item.annotation || ''}`).join(' '),
            relatedActions.map((item) => item.text).join(' '),
          ].join(' ').toLowerCase(),
        });
      });
    });

    const concepts: Concept[] = Array.from(conceptsById.values()).map((concept) => {
      const conceptLinks = bookConceptLinks.filter((link) => link.conceptId === concept.id);
      return {
        ...concept,
        bookCount: concept.bookIds.length,
        totalStrength: conceptLinks.reduce((sum, link) => sum + (link.status === 'rejected' ? 0 : link.strength), 0),
        hasSuggested: conceptLinks.some((link) => link.status === 'suggested'),
      };
    });

    const culturalContexts: CulturalContext[] = Array.from(contextsById.values()).map((context) => ({
      ...context,
      conceptCount: context.conceptIds.length,
    }));

    return {
      books,
      booksById: Object.fromEntries(books.map((book) => [book.id, book])),
      concepts,
      conceptsById: Object.fromEntries(concepts.map((concept) => [concept.id, concept])),
      culturalContexts,
      contextsById: Object.fromEntries(culturalContexts.map((context) => [context.id, context])),
      bookConceptLinks,
      linksById: Object.fromEntries(bookConceptLinks.map((link) => [link.id, link])),
      statusOverrides,
    };
  }

  function getGraphSnapshot({
    query = '',
    mode = 'all',
    topConceptLimit = 10,
    focusConceptId = '',
  }: GraphSnapshotOptions = {}): GraphSnapshot {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    const visibleStatuses: LinkStatus[] = mode === 'suggested' ? ['suggested'] : ['confirmed', 'suggested'];

    let visibleLinks = graphState.bookConceptLinks.filter((link) => visibleStatuses.includes(link.status));
    if (focusConceptId) visibleLinks = visibleLinks.filter((link) => link.conceptId === focusConceptId);

    const queryConceptIds = new Set<string>();
    const queryBookIds = new Set<string>();

    if (normalizedQuery) {
      graphState.concepts.forEach((concept) => {
        if (concept.searchText.includes(normalizedQuery)) queryConceptIds.add(concept.id);
      });
      graphState.books.forEach((book) => {
        const searchText = buildBookSearchText(book);
        if (searchText.includes(normalizedQuery)) queryBookIds.add(book.id);
      });
      visibleLinks = visibleLinks.filter((link) => (
        queryConceptIds.has(link.conceptId) ||
        queryBookIds.has(link.bookId) ||
        link.searchText.includes(normalizedQuery)
      ));
    }

    const visibleConceptIds = new Set(visibleLinks.map((link) => link.conceptId));
    let concepts = graphState.concepts.filter((concept) => visibleConceptIds.has(concept.id));

    if (!normalizedQuery && !focusConceptId) {
      concepts = concepts
        .sort((a, b) => (
          ((b.totalStrength ?? 0) - (a.totalStrength ?? 0)) ||
          ((b.bookCount ?? 0) - (a.bookCount ?? 0)) ||
          a.name.localeCompare(b.name, 'zh-Hans-CN')
        ))
        .slice(0, topConceptLimit);
      const topConceptIds = new Set(concepts.map((concept) => concept.id));
      visibleLinks = visibleLinks.filter((link) => topConceptIds.has(link.conceptId));
    }

    const conceptIds = new Set(visibleLinks.map((link) => link.conceptId));
    const bookIds = new Set(visibleLinks.map((link) => link.bookId));
    const contextIds = new Set(visibleLinks.map((link) => link.contextId).filter(Boolean));

    concepts = graphState.concepts.filter((concept) => conceptIds.has(concept.id));
    const books = graphState.books.filter((book) => bookIds.has(book.id));
    const contexts = graphState.culturalContexts.filter((context) => contextIds.has(context.id));

    const nodes: GraphNode[] = [
      ...concepts.map((concept) => ({
        ...concept,
        type: 'concept' as const,
        weight: Math.max(0.6, concept.totalStrength ?? 0),
      })),
      ...books.map((book) => ({
        ...book,
        type: 'book' as const,
        weight: 0.55,
        bg: book.cover?.bg || '#333',
        text: book.cover?.text || '#eee',
      })),
      ...contexts.map((context) => ({
        ...context,
        type: 'context' as const,
        weight: Math.max(0.45, 0.4 + (context.conceptCount ?? 0) * 0.12),
      })),
    ];

    const links: GraphLink[] = [
      ...visibleLinks.map((link) => ({
        id: link.id,
        source: link.conceptId,
        target: link.bookId,
        linkType: 'book-concept' as const,
        relationType: link.relationType,
        status: link.status,
        strength: link.strength,
      })),
      ...contexts.flatMap((context) => (
        context.conceptIds
          .filter((conceptId) => conceptIds.has(conceptId))
          .map((conceptId) => ({
            id: `${context.id}__${conceptId}`,
            source: context.id,
            target: conceptId,
            linkType: 'context-concept' as const,
            relationType: 'contextualizes',
            status: 'confirmed' as const,
            strength: 0.35,
          }))
      )),
    ];

    return {
      nodes,
      links,
      concepts,
      books,
      contexts,
      stats: {
        books: graphState.books.length,
        concepts: graphState.concepts.length,
        visibleConcepts: concepts.length,
        visibleLinks: visibleLinks.length,
        suggestedLinks: graphState.bookConceptLinks.filter((link) => link.status === 'suggested').length,
      },
    };
  }

  function getConceptDetails(conceptId: string, { focusBookId = '' }: { focusBookId?: string } = {}): ConceptDetails | null {
    const concept = graphState.conceptsById[conceptId];
    if (!concept) return null;

    const relatedLinks = graphState.bookConceptLinks
      .filter((link) => link.conceptId === conceptId)
      .sort((a, b) => {
        if (focusBookId) {
          if (a.bookId === focusBookId) return -1;
          if (b.bookId === focusBookId) return 1;
        }
        if (a.status !== b.status) return a.status === 'suggested' ? 1 : -1;
        return (b.strength - a.strength) || String(b.readAt || '').localeCompare(String(a.readAt || ''));
      });

    const relatedBooks = relatedLinks.map((link) => ({
      link,
      book: graphState.booksById[link.bookId],
      context: link.contextId ? graphState.contextsById[link.contextId] : null,
    })).filter((item) => item.book);

    const relatedContexts = concept.contextIds
      .map((contextId) => graphState.contextsById[contextId])
      .filter(Boolean);

    return {
      concept,
      relatedBooks,
      relatedContexts,
    };
  }

  function getBookRelatedConcepts(bookId: string, { includeRejected = false }: { includeRejected?: boolean } = {}): BookRelatedConcept[] {
    return graphState.bookConceptLinks
      .filter((link) => link.bookId === bookId && (includeRejected || link.status !== 'rejected'))
      .map((link) => ({
        link,
        concept: graphState.conceptsById[link.conceptId],
        context: link.contextId ? graphState.contextsById[link.contextId] : null,
      }))
      .filter((item): item is BookRelatedConcept => Boolean(item.concept))
      .sort((a, b) => {
        if (a.link.status !== b.link.status) return a.link.status === 'suggested' ? 1 : -1;
        return (b.link.strength - a.link.strength) || a.concept.name.localeCompare(b.concept.name, 'zh-Hans-CN');
      });
  }

  /**
   * Inject AI-generated concepts into a book's graph and rebuild state.
   * concepts: array from concept-cards prompt output — each needs id, name,
   * contextTag, relationType, strength, description, readerUnderstanding.
   */
  function addConceptsFromAI(bookId: string, concepts: ConceptSeed[]): boolean {
    const auth = MarginaliaAuth;
    const book: Book | undefined = graphState.booksById[bookId] || BooksStore.getById(bookId)
      || (!auth?.user ? SEED_BOOK_BY_ID[bookId] : null);
    if (!book) return false;

    if (!book.graph) book.graph = {};
    if (!Array.isArray(book.graph.suggestedConcepts)) book.graph.suggestedConcepts = [];

    const existingIds = new Set(book.graph.suggestedConcepts.map((c: ConceptSeed) => c.id));
    let added = 0;
    for (const c of concepts) {
      const id = c.id || slugify(c.name || 'concept');
      if (existingIds.has(id)) continue;
      book.graph.suggestedConcepts.push({
        id,
        name:               c.name || '',
        aliases:            c.aliases || [],
        description:        c.description || '',
        contextTag:         c.contextTag || '',
        relationType:       RELATION_META[c.relationType as RelationType] ? c.relationType : 'supports',
        strength:           typeof c.strength === 'number' ? c.strength : 0.72,
        readerUnderstanding: c.readerUnderstanding || '',
        status:             'suggested',
        origin:             'ai',
      });
      existingIds.add(id);
      added++;
    }

    if (added === 0) return false;

    // Persist updated book record so graph survives reload
    NotesStore?.saveBook(book);

    graphState = buildGraphState();
    window.dispatchEvent(new CustomEvent('marginalia:graph-links-changed', {
      detail: { source: 'ai-import', bookId, added },
    }));
    return true;
  }

  function setBookConceptLinkStatus(linkId: string, status: LinkStatus): boolean {
    if (!STATUS_META[status]) return false;
    const overrides = getStatusOverrides();
    overrides[linkId] = status;
    persistLocalStatus(overrides);
    if (typeof persistStatusOverride === 'function') {
      Promise.resolve(persistStatusOverride({ linkId, status, overrides: { ...overrides } }))
        .catch((error) => logError(error instanceof Error ? error : new Error(String(error)), { context: 'graph persist remote override' }));
    }
    remoteStatusOverrides = { ...overrides };
    graphState = buildGraphState();
    window.dispatchEvent(new CustomEvent('marginalia:graph-links-changed', {
      detail: { linkId, status },
    }));
    return true;
  }

  function useRemoteStatusOverrides(overrides: Record<string, LinkStatus>, source = 'remote'): void {
    remoteStatusOverrides = { ...(overrides || {}) };
    statusOverrideSource = source;
    graphState = buildGraphState();
    window.dispatchEvent(new CustomEvent('marginalia:graph-links-changed', {
      detail: { source: statusOverrideSource },
    }));
  }

  function clearRemoteStatusOverrides(): void {
    remoteStatusOverrides = null;
    statusOverrideSource = 'local';
    graphState = buildGraphState();
    window.dispatchEvent(new CustomEvent('marginalia:graph-links-changed', {
      detail: { source: statusOverrideSource },
    }));
  }

  function setStatusPersistence(handler: typeof persistStatusOverride | null, source = 'local'): void {
    persistStatusOverride = typeof handler === 'function' ? handler : null;
    statusOverrideSource = source;
  }

  function getLinkStatusMeta(status: LinkStatus): StatusMeta {
    return STATUS_META[status] || STATUS_META.confirmed;
  }

  function getRelationMeta(relationType: RelationType): RelationMeta {
    return RELATION_META[relationType] || RELATION_META.supports;
  }

  function lookupContextDescription(book: Book, contextTag: string): string {
    return book.cultural?.find((item: Book) => item.tag === contextTag)?.body || '';
  }

  function getBookConceptSeeds(book: Book): ConceptSeed[] {
    const explicit: ConceptSeed[] = [
      ...(book.graph?.concepts || []).map((item: ConceptSeed) => ({ ...item, status: item.status || 'confirmed' })),
      ...(book.graph?.suggestedConcepts || []).map((item: ConceptSeed) => ({ ...item, status: 'suggested', origin: item.origin || 'ai' })),
    ];
    if (explicit.length) return explicit;
    return deriveLegacyConceptSeeds(book);
  }

  function deriveLegacyConceptSeeds(book: Book): ConceptSeed[] {
    return (book.cultural || []).map((item: Book, index: number) => ({
      id: item.conceptId || slugify(stripParenthetical(item.term) || `${book.id}-concept-${index}`),
      name: stripParenthetical(item.term) || item.term || item.tag,
      aliases: item.term && stripParenthetical(item.term) !== item.term ? [item.term] : [],
      description: item.body || '',
      contextTag: item.tag || '',
      contextDescription: item.body || '',
      relationType: 'supports',
      strength: 0.72,
      readerUnderstanding: '',
      highlightIds: [],
      actionIds: [],
    }));
  }

  function getStatusOverrides(): Record<string, LinkStatus> {
    if (remoteStatusOverrides && typeof remoteStatusOverrides === 'object') {
      return { ...remoteStatusOverrides };
    }
    return readLocalStatusOverrides();
  }

  function readLocalStatusOverrides(): Record<string, LinkStatus> {
    try {
      const raw = window.localStorage.getItem(STATUS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function persistLocalStatus(overrides: Record<string, LinkStatus>): void {
    try {
      window.localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(overrides));
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), { context: 'graph persist local override' });
    }
  }

  function buildBookSearchText(book: Book): string {
    return [
      book.title || '',
      book.titleZh || '',
      book.author || '',
      book.authorZh || '',
      (book.tags || []).join(' '),
      book.summary || '',
      book.insight?.oneLiner || '',
    ].join(' ').toLowerCase();
  }

  function stripParenthetical(value: unknown): string {
    return String(value || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function slugify(value: unknown): string {
    const latin = String(value || '').trim().toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return latin || 'item';
  }

  function appendUnique(list: string[], ...values: Array<string | undefined | null>): void {
    values.filter(Boolean).forEach((value) => {
      if (value && !list.includes(value)) list.push(value);
    });
  }

  return {
    backend: 'static-seed',
    cloudReady: true,
    collections: ['books', 'concepts', 'bookConceptLinks', 'culturalContexts', 'highlights', 'actions'],
    getGraphSnapshot,
    getConceptDetails,
    getBookRelatedConcepts,
    getRelationMeta,
    getLinkStatusMeta,
    setBookConceptLinkStatus,
    addConceptsFromAI,
    useRemoteStatusOverrides,
    clearRemoteStatusOverrides,
    setStatusPersistence,
    get statusSource() { return statusOverrideSource; },
  };
})();
