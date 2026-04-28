/* ==========================================================================
   Marginalia · AI Generate UI
   --------------------------------------------------------------------------
   Injects "Generate with AI" buttons into panels that have a registered
   AI feature. Handles loading state, error display, and AI-label stamping.

   Each panel's book-section div gets a .ai-toolbar appended.
   On success the generated content is rendered into the panel and stamped
   with an .ai-badge.

   Called after enterBook() renders the DOM:
     window.AIGenerateUI.mount(book, rootEl)
   ========================================================================== */

window.AIGenerateUI = (() => {

  function mount(book, root) {
    if (!window.AIFeatureRegistry || !window.BookTypes) return;

    const features = window.AIFeatureRegistry.forBook(book);
    if (!features.length) return;

    features.forEach(feature => {
      // Find the panel section this feature targets
      const panelId = feature.panel;
      const section = root.querySelector(`.book-section#${CSS.escape(panelId)}`)
        || root.querySelector(`.book-section#knowledge`)   // mindmap uses id="knowledge"
        || root.querySelector(`.book-section#concepts`);   // concept-cards uses id="concepts"

      // More precise matching by feature→panel
      const targetSection = findTargetSection(root, feature);
      if (!targetSection) return;

      // Don't add duplicate toolbars
      if (targetSection.querySelector('.ai-toolbar')) return;

      const toolbar = buildToolbar(feature, book, targetSection);
      targetSection.prepend(toolbar);
    });
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

    injectResult(feature, book, section, result);
    showStatus(statusEl, 'Generated', 'ok');
  }

  function injectResult(feature, book, section, result) {
    // Remove any previous AI-generated content block
    section.querySelector('.ai-generated-block')?.remove();

    const block = document.createElement('div');
    block.className = 'ai-generated-block';
    block.innerHTML = `
      <div class="ai-generated-header">
        <span class="ai-badge">✦ AI Generated</span>
        <span class="ai-generated-model">${window.MarginaliaAI.getModel()}</span>
        <button class="ai-generated-dismiss" type="button" title="Dismiss">×</button>
      </div>
      <div class="ai-generated-content">
        ${renderResult(feature, result)}
      </div>
    `;

    block.querySelector('.ai-generated-dismiss').addEventListener('click', () => block.remove());
    section.appendChild(block);
    block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
            <div class="ai-action-text">${esc(a.text || '')}</div>
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
