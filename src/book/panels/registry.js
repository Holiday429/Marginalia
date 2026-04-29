/* ==========================================================================
   Marginalia · Panel Registry
   --------------------------------------------------------------------------
   Every panel that can appear in a book detail view is registered here.
   book.js reads this registry to build the tab bar and render content.

   To add a new panel:
     1. Add an entry here with a unique id.
     2. Create the render function in src/book/panels/{id}.js (or inline).
     3. Load the script in index.html before book.js.

   The `render` field is initially null — each panel script sets it via
     window.PanelRegistry.set('id', renderFn)
   This lets panel scripts load independently without strict ordering.
   ========================================================================== */

window.PanelRegistry = (() => {
  const _panels = {

    /* ── Universal panels ─────────────────────────────────────────────────── */

    overview: {
      label: 'Overview',
      icon: '◎',
      universal: true,  // shown on all book types unless explicitly excluded
      render: null,
    },

    highlights: {
      label: 'Highlights',
      icon: '✦',
      universal: true,
      render: null,
    },

    notes: {
      label: 'Notes',
      icon: '✎',
      universal: true,
      render: null,
    },

    'claude-import': {
      label: 'Visual Notes',
      icon: '⧉',
      universal: true,
      render: null,
    },

    /* ── Fiction panels ───────────────────────────────────────────────────── */

    characters: {
      label: 'Characters',
      icon: '◈',
      universal: false,
      render: null,
    },

    timeline: {
      label: 'Timeline',
      icon: '◇',
      universal: false,
      render: null,
    },

    /* ── Nonfiction / Science panels ─────────────────────────────────────── */

    mindmap: {
      label: 'Mind Map',
      icon: '◉',
      universal: false,
      render: null,
    },

    /* ── Social Science panels ───────────────────────────────────────────── */

    'concept-cards': {
      label: 'Concepts',
      icon: '▣',
      universal: false,
      render: null,
    },

    /* ── Travel panels ───────────────────────────────────────────────────── */

    'geo-context': {
      label: 'Geography',
      icon: '◬',
      universal: false,
      render: null,
    },

    /* ── Essay / Self-help panels ────────────────────────────────────────── */

    actions: {
      label: 'To Do',
      icon: '◻',
      universal: false,
      render: null,
    },

    /* ── Legacy / per-book panels (pre-4A, kept for backward compat) ─────── */

    conclusion: {
      label: 'My Conclusion',
      icon: '◑',
      universal: false,
      render: null,
    },

    related: {
      label: 'Related Books',
      icon: '◎',
      universal: false,
      render: null,
    },

    context: {
      label: 'Reading Context',
      icon: '◐',
      universal: false,
      render: null,
    },

  };

  return {
    /**
     * Register a render function for a panel.
     * Called by each panel's own script file.
     * @param {string} id
     * @param {function} renderFn  (book, container) => void
     */
    set(id, renderFn) {
      if (!_panels[id]) {
        console.warn(`[PanelRegistry] Unknown panel id: "${id}"`);
        return;
      }
      _panels[id].render = renderFn;
    },

    /** Get panel config by id. */
    get(id) {
      return _panels[id] || null;
    },

    /**
     * Resolve the ordered panel list for a book.
     * Filters out any panels whose render function hasn't loaded yet.
     * @param {object} book
     * @returns {Array<{id, label, icon, render}>}
     */
    forBook(book) {
      const ids = window.BookTypes.getPanels(book);
      return ids
        .map(id => ({ id, ...(_panels[id] || {}) }))
        .filter(p => p.label);  // drop unknown ids silently
    },

    /** All registered panel ids. */
    all() {
      return Object.keys(_panels);
    },
  };
})();
