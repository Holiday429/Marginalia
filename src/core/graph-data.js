/* ==========================================================================
   Marginalia · Graph data facade
   --------------------------------------------------------------------------
   Cloud-ready graph layer that derives Concept / BookConceptLink /
   CulturalContext entities from the current static BOOK_DETAILS seed.
   Future Firebase sync should replace the seed adapter, not the view code.
   ========================================================================== */

window.MarginaliaGraph = (() => {
  const STATUS_STORAGE_KEY = 'marginalia.bookConceptLink.status.v1';

  const RELATION_META = {
    'core-thesis':   { label: 'Core thesis', color: '#d5aa64', strength: 1.0 },
    supports:        { label: 'Supports', color: '#87b6a7', strength: 0.8 },
    contrasts:       { label: 'Contrasts', color: '#b67d7d', strength: 0.74 },
    extends:         { label: 'Extends', color: '#7f97c6', strength: 0.72 },
    questions:       { label: 'Questions', color: '#c6945b', strength: 0.78 },
    'action-trigger':{ label: 'Action trigger', color: '#d97b65', strength: 0.88 },
  };

  const STATUS_META = {
    confirmed: { label: 'Confirmed', visible: true },
    suggested: { label: 'AI suggested', visible: true },
    rejected:  { label: 'Rejected', visible: false },
  };

  let statusOverrideSource = 'local';
  let remoteStatusOverrides = null;
  let persistStatusOverride = null;
  let graphState = buildGraphState();

  function buildGraphState() {
    const books = Array.isArray(window.BOOK_DETAILS) ? window.BOOK_DETAILS : [];
    const statusOverrides = getStatusOverrides();
    const conceptsById = new Map();
    const contextsById = new Map();
    const bookConceptLinks = [];

    books.forEach((book) => {
      getBookConceptSeeds(book).forEach((seed, index) => {
        const conceptId = seed.id || slugify(seed.name || `${book.id}-concept-${index}`);
        const contextId = seed.contextTag ? `context-${slugify(seed.contextTag)}` : null;
        const linkId = `${book.id}__${conceptId}`;
        const status = statusOverrides[linkId] || seed.status || 'confirmed';
        const relationType = RELATION_META[seed.relationType] ? seed.relationType : 'supports';
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

        const concept = conceptsById.get(conceptId) || {
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
          const context = contextsById.get(contextId) || {
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

        const evidenceHighlights = (seed.highlightIds || [])
          .map((highlightId) => book.highlights?.find((item) => String(item.id) === String(highlightId)))
          .filter(Boolean)
          .map((item) => ({
            id: item.id,
            quote: item.quote,
            chapter: item.chapter,
            page: item.page,
            annotation: item.annotation || '',
          }));

        const relatedActions = (seed.actionIds || [])
          .map((actionId) => book.actions?.find((item) => item.id === actionId))
          .filter(Boolean)
          .map((item) => ({
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

    const concepts = Array.from(conceptsById.values()).map((concept) => {
      const conceptLinks = bookConceptLinks.filter((link) => link.conceptId === concept.id);
      return {
        ...concept,
        bookCount: concept.bookIds.length,
        totalStrength: conceptLinks.reduce((sum, link) => sum + (link.status === 'rejected' ? 0 : link.strength), 0),
        hasSuggested: conceptLinks.some((link) => link.status === 'suggested'),
      };
    });

    const culturalContexts = Array.from(contextsById.values()).map((context) => ({
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
  } = {}) {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    const visibleStatuses = mode === 'suggested' ? ['suggested'] : ['confirmed', 'suggested'];

    let visibleLinks = graphState.bookConceptLinks.filter((link) => visibleStatuses.includes(link.status));
    if (focusConceptId) visibleLinks = visibleLinks.filter((link) => link.conceptId === focusConceptId);

    const queryConceptIds = new Set();
    const queryBookIds = new Set();

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
          (b.totalStrength - a.totalStrength) ||
          (b.bookCount - a.bookCount) ||
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

    const nodes = [
      ...concepts.map((concept) => ({
        ...concept,
        type: 'concept',
        weight: Math.max(0.6, concept.totalStrength),
      })),
      ...books.map((book) => ({
        ...book,
        type: 'book',
        weight: 0.55,
        bg: book.cover?.bg || '#333',
        text: book.cover?.text || '#eee',
      })),
      ...contexts.map((context) => ({
        ...context,
        type: 'context',
        weight: Math.max(0.45, 0.4 + context.conceptCount * 0.12),
      })),
    ];

    const links = [
      ...visibleLinks.map((link) => ({
        id: link.id,
        source: link.conceptId,
        target: link.bookId,
        linkType: 'book-concept',
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
            linkType: 'context-concept',
            relationType: 'contextualizes',
            status: 'confirmed',
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

  function getConceptDetails(conceptId, { focusBookId = '' } = {}) {
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

  function getBookRelatedConcepts(bookId, { includeRejected = false } = {}) {
    return graphState.bookConceptLinks
      .filter((link) => link.bookId === bookId && (includeRejected || link.status !== 'rejected'))
      .map((link) => ({
        link,
        concept: graphState.conceptsById[link.conceptId],
        context: link.contextId ? graphState.contextsById[link.contextId] : null,
      }))
      .filter((item) => item.concept)
      .sort((a, b) => {
        if (a.link.status !== b.link.status) return a.link.status === 'suggested' ? 1 : -1;
        return (b.link.strength - a.link.strength) || a.concept.name.localeCompare(b.concept.name, 'zh-Hans-CN');
      });
  }

  function setBookConceptLinkStatus(linkId, status) {
    if (!STATUS_META[status]) return false;
    const overrides = getStatusOverrides();
    overrides[linkId] = status;
    persistLocalStatus(overrides);
    if (typeof persistStatusOverride === 'function') {
      Promise.resolve(persistStatusOverride({ linkId, status, overrides: { ...overrides } }))
        .catch((error) => console.warn('[graph] Failed to persist remote override.', error));
    }
    remoteStatusOverrides = { ...overrides };
    graphState = buildGraphState();
    window.dispatchEvent(new CustomEvent('marginalia:graph-links-changed', {
      detail: { linkId, status },
    }));
    return true;
  }

  function useRemoteStatusOverrides(overrides, source = 'remote') {
    remoteStatusOverrides = { ...(overrides || {}) };
    statusOverrideSource = source;
    graphState = buildGraphState();
    window.dispatchEvent(new CustomEvent('marginalia:graph-links-changed', {
      detail: { source: statusOverrideSource },
    }));
  }

  function clearRemoteStatusOverrides() {
    remoteStatusOverrides = null;
    statusOverrideSource = 'local';
    graphState = buildGraphState();
    window.dispatchEvent(new CustomEvent('marginalia:graph-links-changed', {
      detail: { source: statusOverrideSource },
    }));
  }

  function setStatusPersistence(handler, source = 'local') {
    persistStatusOverride = typeof handler === 'function' ? handler : null;
    statusOverrideSource = source;
  }

  function getLinkStatusMeta(status) {
    return STATUS_META[status] || STATUS_META.confirmed;
  }

  function getRelationMeta(relationType) {
    return RELATION_META[relationType] || RELATION_META.supports;
  }

  function lookupContextDescription(book, contextTag) {
    return book.cultural?.find((item) => item.tag === contextTag)?.body || '';
  }

  function getBookConceptSeeds(book) {
    const explicit = [
      ...(book.graph?.concepts || []).map((item) => ({ ...item, status: item.status || 'confirmed' })),
      ...(book.graph?.suggestedConcepts || []).map((item) => ({ ...item, status: 'suggested', origin: item.origin || 'ai' })),
    ];
    if (explicit.length) return explicit;
    return deriveLegacyConceptSeeds(book);
  }

  function deriveLegacyConceptSeeds(book) {
    return (book.cultural || []).map((item, index) => ({
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

  function getStatusOverrides() {
    if (remoteStatusOverrides && typeof remoteStatusOverrides === 'object') {
      return { ...remoteStatusOverrides };
    }
    return readLocalStatusOverrides();
  }

  function readLocalStatusOverrides() {
    try {
      const raw = window.localStorage.getItem(STATUS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function persistLocalStatus(overrides) {
    try {
      window.localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(overrides));
    } catch (error) {
      console.warn('[graph] Failed to persist local override.', error);
    }
  }

  function buildBookSearchText(book) {
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

  function stripParenthetical(value) {
    return String(value || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function slugify(value) {
    const latin = String(value || '').trim().toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return latin || 'item';
  }

  function appendUnique(list, ...values) {
    values.filter(Boolean).forEach((value) => {
      if (!list.includes(value)) list.push(value);
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
    useRemoteStatusOverrides,
    clearRemoteStatusOverrides,
    setStatusPersistence,
    get statusSource() { return statusOverrideSource; },
  };
})();
