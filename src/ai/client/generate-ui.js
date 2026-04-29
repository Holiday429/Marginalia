/* ==========================================================================
   Marginalia · AI Generate UI
   --------------------------------------------------------------------------
   Injects "Generate with AI" buttons into panels that have a registered
   AI feature. Handles loading state, error display, and AI-label stamping.

   Results are persisted to IndexedDB (NotesStore) and restored on re-enter
   without re-calling the API.

   Called after enterBook() renders the DOM:
     window.AIGenerateUI.mount(book, rootEl)
   ========================================================================== */

window.AIGenerateUI = (() => {

  async function mount(book, root) {
    if (!window.AIFeatureRegistry || !window.BookTypes) return;

    const features = window.AIFeatureRegistry.forBook(book);
    if (!features.length) return;

    for (const feature of features) {
      const targetSection = findTargetSection(root, feature);
      if (!targetSection) continue;

      // Don't add duplicate toolbars
      if (targetSection.querySelector('.ai-toolbar')) continue;

      const toolbar = buildToolbar(feature, book, targetSection);
      targetSection.prepend(toolbar);

      // Restore previously generated result (no API call)
      const saved = await window.NotesStore?.getAiResult(book.id, feature.id);
      if (saved) {
        injectResult(feature, book, targetSection, saved, { fromCache: true });
      }
    }
  }

  function findTargetSection(root, feature) {
    const panelToSectionId = {
      'mindmap':        'knowledge',
      'concept-cards':  'concepts',
      'actions':        'actions',
      'geo-context':    'cultural',
      'characters':     'characters',
      'timeline':       'knowledge',
    };
    const sectionId = panelToSectionId[feature.panel] || feature.panel;
    return root.querySelector(`.book-section#${CSS.escape(sectionId)}`);
  }

  function buildToolbar(feature, book, section) {
    const toolbar = document.createElement('div');
    toolbar.className = 'ai-toolbar';
    toolbar.innerHTML = `
      <div class="ai-toolbar-inner">
        <span class="ai-toolbar-label">
          <span class="ai-badge-icon">✦</span> AI
        </span>
        <button class="ai-generate-btn" type="button">${feature.label}</button>
        <span class="ai-toolbar-status" hidden></span>
      </div>
    `;

    const btn = toolbar.querySelector('.ai-generate-btn');
    const statusEl = toolbar.querySelector('.ai-toolbar-status');

    btn.addEventListener('click', () => run(feature, book, section, btn, statusEl));
    return toolbar;
  }

  async function run(feature, book, section, btn, statusEl) {
    if (!window.MarginaliaAI.hasKey()) {
      showStatus(statusEl, 'No API key — open AI Settings (gear icon) to add one.', 'error');
      return;
    }

    const prompt = window.AIFeatureRegistry.buildPrompt(feature.id, book);
    if (!prompt) {
      showStatus(statusEl, 'Prompt not loaded yet — try again.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Generating…';
    showStatus(statusEl, '', '');

    const result = await window.MarginaliaAI.generateJSON({
      prompt,
      onError(err) {
        showStatus(statusEl, err.message, 'error');
        btn.disabled = false;
        btn.textContent = feature.label;
      },
    });

    btn.disabled = false;
    btn.textContent = feature.label;

    if (!result) return;

    // Persist before rendering so a reload will show it
    await window.NotesStore?.saveAiResult(book.id, feature.id, result);

    injectResult(feature, book, section, result, { fromCache: false });
    showStatus(statusEl, 'Generated', 'ok');
  }

  const CONCEPT_FEATURES = new Set(['concept-cards', 'argument-breakdown']);

  function injectResult(feature, book, section, result, { fromCache = false } = {}) {
    // Remove any previous AI-generated content block
    section.querySelector('.ai-generated-block')?.remove();

    const canAddToGraph = CONCEPT_FEATURES.has(feature.id) && Array.isArray(result) && result.length > 0;

    const block = document.createElement('div');
    block.className = 'ai-generated-block';
    block.innerHTML = `
      <div class="ai-generated-header">
        <span class="ai-badge">✦ AI Generated</span>
        <span class="ai-generated-model">${fromCache ? 'cached' : window.MarginaliaAI.getModel()}</span>
        ${canAddToGraph ? `<button class="ai-graph-btn" type="button" title="Add concepts to concept graph">+ Graph</button>` : ''}
        <button class="ai-regen-btn" type="button" title="Regenerate">↺ Regenerate</button>
        <button class="ai-generated-dismiss" type="button" title="Dismiss">×</button>
      </div>
      <div class="ai-generated-content">
        ${renderResult(feature, result)}
      </div>
    `;

    block.querySelector('.ai-generated-dismiss').addEventListener('click', async () => {
      await window.NotesStore?.deleteAiResult(book.id, feature.id);
      block.remove();
    });

    block.querySelector('.ai-regen-btn').addEventListener('click', async () => {
      block.remove();
      const toolbar = section.querySelector('.ai-toolbar');
      const btn = toolbar?.querySelector('.ai-generate-btn');
      const statusEl = toolbar?.querySelector('.ai-toolbar-status');
      if (btn && statusEl) await run(feature, book, section, btn, statusEl);
    });

    if (canAddToGraph) {
      const graphBtn = block.querySelector('.ai-graph-btn');
      graphBtn.addEventListener('click', () => {
        const added = window.MarginaliaGraph?.addConceptsFromAI(book.id, result);
        if (added) {
          graphBtn.textContent = '✓ Added';
          graphBtn.disabled = true;
        } else {
          graphBtn.textContent = 'Already added';
          graphBtn.disabled = true;
        }
      });
    }

    section.appendChild(block);
    if (!fromCache) block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderResult(feature, result) {
    switch (feature.id) {

      case 'mindmap-gen':
      case 'timeline-gen': {
        const timeline = Array.isArray(result) ? result : (result.timeline || []);
        return timeline.map(group => `
          <div class="ai-timeline-group">
            <div class="ai-timeline-era">${esc(group.era || '')}</div>
            ${(group.items || []).map(item => `
              <div class="ai-timeline-item">
                <span class="ai-timeline-year">${esc(item.year || '')}</span>
                <span class="ai-timeline-title">${esc(item.title || '')}</span>
                <div class="ai-pill-row">${(item.tags || []).map(t => `<span class="ai-pill">${esc(t)}</span>`).join('')}</div>
              </div>
            `).join('')}
          </div>
        `).join('');
      }

      case 'concept-cards':
      case 'argument-breakdown': {
        const items = Array.isArray(result) ? result : [];
        return `<div class="ai-concept-grid">${items.map(c => `
          <div class="ai-concept-card">
            <div class="ai-concept-tag">${esc(c.contextTag || '')}</div>
            <h4>${esc(c.name || '')}</h4>
            <p>${esc(c.description || '')}</p>
            ${c.readerUnderstanding ? `<p class="ai-concept-reader"><em>${esc(c.readerUnderstanding)}</em></p>` : ''}
          </div>
        `).join('')}</div>`;
      }

      case 'action-suggest': {
        const items = Array.isArray(result) ? result : [];
        return `<ul class="ai-action-list">${items.map(a => `
          <li class="ai-action-item">
            <div class="ai-action-check"></div>
            <div class="ai-action-text">${esc(a.text || a)}</div>
          </li>
        `).join('')}</ul>`;
      }

      default:
        return `<pre class="ai-raw">${esc(JSON.stringify(result, null, 2))}</pre>`;
    }
  }

  function showStatus(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
    el.className = 'ai-toolbar-status' + (type ? ` ai-status-${type}` : '');
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
  }

  return { mount };
})();
