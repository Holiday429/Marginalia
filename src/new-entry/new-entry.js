/* ==========================================================================
   Marginalia · Add Book — add a book + DIY spine/cover
   ========================================================================== */

window.NewEntry = (() => {

  /* ── Spine palette ───────────────────────────────────────────────────────── */

  const SPINE_COLORS = [
    // Warm neutrals
    { hex: '#d4c4a0', label: 'Parchment' },
    { hex: '#c8b99a', label: 'Sand' },
    { hex: '#b8a882', label: 'Wheat' },
    { hex: '#c89f85', label: 'Clay' },
    { hex: '#b87060', label: 'Terracotta' },
    // Reds & burgundy
    { hex: '#8b2a1a', label: 'Crimson' },
    { hex: '#7a1f2a', label: 'Burgundy' },
    { hex: '#c83a2a', label: 'Vermilion' },
    { hex: '#a04040', label: 'Brick' },
    { hex: '#d85a30', label: 'Rust' },
    // Greens
    { hex: '#2d5a30', label: 'Forest' },
    { hex: '#2f4a3a', label: 'Bottle' },
    { hex: '#3d5a46', label: 'Sage' },
    { hex: '#aab39a', label: 'Fern' },
    { hex: '#6a7a5a', label: 'Olive' },
    // Blues & navy
    { hex: '#14263e', label: 'Navy' },
    { hex: '#1a2550', label: 'Midnight' },
    { hex: '#2a3f4a', label: 'Slate' },
    { hex: '#1e3a4a', label: 'Teal' },
    { hex: '#378add', label: 'Cobalt' },
    // Purples & violet
    { hex: '#3a2a5a', label: 'Violet' },
    { hex: '#3a2a4a', label: 'Plum' },
    { hex: '#7f77dd', label: 'Lavender' },
    { hex: '#2a1a3a', label: 'Aubergine' },
    // Yellows & gold
    { hex: '#d89f3a', label: 'Gold' },
    { hex: '#c68b4a', label: 'Amber' },
    { hex: '#d4c068', label: 'Straw' },
    { hex: '#8f6f2a', label: 'Ochre' },
    // Pinks & rose
    { hex: '#e8aabd', label: 'Rose' },
    { hex: '#d4537e', label: 'Fuchsia' },
    { hex: '#9a5a4a', label: 'Blush' },
    // Darks & black
    { hex: '#1a1714', label: 'Ink' },
    { hex: '#2a2824', label: 'Charcoal' },
    { hex: '#3a3a3a', label: 'Graphite' },
    { hex: '#5a544a', label: 'Dusk' },
    // Lights
    { hex: '#ede5d4', label: 'Cream' },
    { hex: '#e8dfc8', label: 'Paper' },
    { hex: '#cfd8e8', label: 'Frost' },
    { hex: '#f3ede2', label: 'Linen' },
  ];

  const SPINE_STYLES = [
    {
      id: 'minimal',
      label: 'Minimal',
      font: "'Fraunces', serif",
      weight: 400,
      size: 13,
      tracking: '0.02em',
      band: null,
      topMark: null,
    },
    {
      id: 'classic',
      label: 'Classic',
      font: "'Fraunces', serif",
      weight: 600,
      size: 13,
      tracking: '0.06em',
      band: 'rgba(0,0,0,0.18)',
      topMark: '·',
    },
    {
      id: 'bold',
      label: 'Bold',
      font: "'Bodoni Moda', serif",
      weight: 800,
      size: 15,
      tracking: '-0.01em',
      band: null,
      topMark: null,
    },
    {
      id: 'mono',
      label: 'Mono',
      font: "'IBM Plex Mono', monospace",
      weight: 500,
      size: 11,
      tracking: '0.16em',
      band: 'rgba(0,0,0,0.25)',
      topMark: '||',
    },
    {
      id: 'editorial',
      label: 'Editorial',
      font: "'Fraunces', serif",
      weight: 300,
      size: 12,
      tracking: '0.08em',
      band: 'rgba(255,255,255,0.12)',
      topMark: '○',
    },
  ];

  /* ── Text color auto-contrast ────────────────────────────────────────────── */

  function autoTextColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.45 ? '#1a1714' : '#e8dfc8';
  }

  function isCJK(str) {
    return /[一-鿿぀-ヿ]/.test(str || '');
  }

  /* ── State ───────────────────────────────────────────────────────────────── */

  const state = {
    spineColor:   '#14263e',
    textColor:    '#e8dfc8',
    styleId:      'classic',
    title:        '',
    author:       '',
    thickness:    34,   // px equivalent (w in SHELF_BOOKS)
    height:       0.88, // h ratio
    status:       'reading',
    coverFile:    null,
    coverPreview: null,
  };

  /* ── Mount / unmount ─────────────────────────────────────────────────────── */

  function mount() {
    if (document.getElementById('newEntryDialog')) {
      open();
      return;
    }

    const dialog = document.createElement('dialog');
    dialog.id = 'newEntryDialog';
    dialog.className = 'ne-dialog';
    dialog.innerHTML = buildHTML();
    document.body.appendChild(dialog);

    bindEvents(dialog);
    open();
  }

  function open() {
    const dialog = document.getElementById('newEntryDialog');
    if (!dialog) return;
    dialog.showModal();
    renderSpinePreview();
  }

  function close() {
    document.getElementById('newEntryDialog')?.close();
  }

  /* ── HTML ────────────────────────────────────────────────────────────────── */

  function buildHTML() {
    return `
      <div class="ne-layout">

        <!-- Left: Spine preview + DIY controls -->
        <div class="ne-spine-panel">
          <div class="ne-spine-preview-wrap">
            <div class="ne-spine-preview" id="neSpinePreview"></div>
            <div class="ne-cover-preview" id="neCoverPreview">
              <img id="neCoverImg" alt="Cover preview" hidden>
              <div class="ne-cover-placeholder" id="neCoverPlaceholder">
                <span>Cover</span>
              </div>
              <label class="ne-cover-upload-btn service-ui-text" for="neCoverInput">Upload Cover</label>
              <input type="file" id="neCoverInput" accept="image/*" hidden>
            </div>
          </div>

          <div class="ne-diy-section">
            <div class="ne-diy-label">Spine Color</div>
            <div class="ne-color-grid" id="neColorGrid">
              ${SPINE_COLORS.map(c => `
                <button class="ne-color-swatch${c.hex === state.spineColor ? ' is-active' : ''}"
                  type="button" data-color="${c.hex}"
                  style="background:${c.hex}"
                  title="${c.label}"></button>
              `).join('')}
            </div>
            <div class="ne-custom-color-row">
              <label class="ne-diy-label" for="neCustomColor">Custom</label>
              <input type="color" id="neCustomColor" value="${state.spineColor}" class="ne-color-picker">
            </div>
          </div>

          <div class="ne-diy-section">
            <div class="ne-diy-label">Style</div>
            <div class="ne-style-row" id="neStyleRow">
              ${SPINE_STYLES.map(s => `
                <button class="ne-style-btn${s.id === state.styleId ? ' is-active' : ''}"
                  type="button" data-style="${s.id}">${s.label}</button>
              `).join('')}
            </div>
          </div>

          <div class="ne-diy-section">
            <div class="ne-diy-label">Thickness</div>
            <div class="ne-slider-row">
              <input type="range" id="neThickness" min="20" max="60" value="${state.thickness}" class="ne-slider">
              <span class="ne-slider-val" id="neThicknessVal">${state.thickness}px</span>
            </div>
          </div>
        </div>

        <!-- Right: Book info form -->
        <form class="ne-form" id="neForm" novalidate>
          <div class="ne-form-head">
            <h2 class="ne-form-title">Add Book</h2>
            <button class="ne-close-btn" type="button" id="neCloseBtn" aria-label="Close">×</button>
          </div>

          <div class="ne-field">
            <label class="ne-label" for="neTitle">Title <span class="ne-req">*</span></label>
            <input class="ne-input" id="neTitle" type="text" placeholder="Book Title" autocomplete="off">
          </div>

          <div class="ne-field">
            <label class="ne-label" for="neAuthor">Author</label>
            <input class="ne-input" id="neAuthor" type="text" placeholder="Author Name">
          </div>

          <div class="ne-field-row">
            <div class="ne-field">
              <label class="ne-label" for="neStatus">Status</label>
              <select class="ne-select" id="neStatus">
                <option value="reading">Reading</option>
                <option value="finished">Finished</option>
                <option value="want">To Read</option>
              </select>
            </div>
            <div class="ne-field">
              <label class="ne-label" for="neLanguage">Language</label>
              <select class="ne-select" id="neLanguage">
                <option value="en">English</option>
                <option value="zh">Chinese</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div class="ne-field">
            <label class="ne-label" for="neBookType">Book Type <span class="ne-field-hint-inline">— determines AI features</span></label>
            <select class="ne-select" id="neBookType">
              <option value="nonfiction">Nonfiction — history, science, biography</option>
              <option value="fiction">Fiction — novels, literary fiction</option>
              <option value="social">Social Science — philosophy, sociology, economics</option>
              <option value="essay">Essay / Self-help — personal essays, self-help</option>
              <option value="travel">Travel — travel writing, cultural reportage</option>
            </select>
          </div>

          <div class="ne-field">
            <label class="ne-label" for="neOrigin">Country / Origin</label>
            <input class="ne-input" id="neOrigin" type="text" placeholder="e.g. Japan, United States">
          </div>

          <div class="ne-field">
            <label class="ne-label" for="neTags">Tags</label>
            <input class="ne-input" id="neTags" type="text" placeholder="e.g. Fiction, History, Philosophy">
            <div class="ne-field-hint">Separate with Commas</div>
          </div>

          <div class="ne-field">
            <label class="ne-label" for="neExternalLink">External Link</label>
            <input class="ne-input" id="neExternalLink" type="url" placeholder="Douban / Amazon URL">
          </div>

          <div class="ne-isbn-row">
            <input class="ne-input ne-isbn-input" id="neIsbn" type="text" placeholder="ISBN — paste to auto-fill">
            <button class="ne-isbn-btn" type="button" id="neIsbnBtn">Lookup</button>
          </div>
          <div class="ne-isbn-status" id="neIsbnStatus"></div>

          <div class="ne-form-actions">
            <button class="ne-submit-btn" type="submit" id="neSubmitBtn">Add Book</button>
            <button class="ne-cancel-btn" type="button" id="neCancelBtn">Cancel</button>
          </div>
        </form>

      </div>
    `;
  }

  /* ── Spine preview renderer ──────────────────────────────────────────────── */

  function renderSpinePreview() {
    const wrap = document.getElementById('neSpinePreview');
    if (!wrap) return;

    const style = SPINE_STYLES.find(s => s.id === state.styleId) || SPINE_STYLES[0];
    const title = state.title || 'Title';
    const author = state.author || 'Author';
    const lang = document.getElementById('neLanguage')?.value || 'en';
    const isChinese = lang === 'zh' || isCJK(title);

    const w = Math.max(24, state.thickness);
    const h = 192;

    wrap.style.width   = w + 'px';
    wrap.style.height  = h + 'px';
    wrap.style.background = state.spineColor;
    wrap.style.color      = state.textColor;
    wrap.style.fontFamily = style.font;
    wrap.style.fontWeight = style.weight;
    wrap.style.fontSize   = style.size + 'px';
    wrap.style.letterSpacing = style.tracking;

    // Band decoration
    const existingBand = wrap.querySelector('.ne-spine-band');
    if (existingBand) existingBand.remove();
    if (style.band) {
      const band = document.createElement('div');
      band.className = 'ne-spine-band';
      band.style.background = style.band;
      wrap.appendChild(band);
    }

    // Top mark
    const existingMark = wrap.querySelector('.ne-spine-mark');
    if (existingMark) existingMark.remove();
    if (style.topMark) {
      const mark = document.createElement('div');
      mark.className = 'ne-spine-mark';
      mark.textContent = style.topMark;
      wrap.appendChild(mark);
    }

    // Title text
    let titleEl = wrap.querySelector('.ne-spine-title');
    if (!titleEl) {
      titleEl = document.createElement('div');
      titleEl.className = 'ne-spine-title';
      wrap.appendChild(titleEl);
    }
    titleEl.textContent = title;
    titleEl.style.writingMode = isChinese ? 'vertical-rl' : 'horizontal-tb';
    titleEl.style.textOrientation = isChinese ? 'upright' : 'mixed';

    // Author text
    let authorEl = wrap.querySelector('.ne-spine-author');
    if (!authorEl) {
      authorEl = document.createElement('div');
      authorEl.className = 'ne-spine-author';
      wrap.appendChild(authorEl);
    }
    authorEl.textContent = author;
    authorEl.style.writingMode = isChinese ? 'vertical-rl' : 'horizontal-tb';

    // Cover preview bg color sync
    const coverPlaceholder = document.getElementById('neCoverPlaceholder');
    if (coverPlaceholder) {
      coverPlaceholder.style.background = state.spineColor;
      coverPlaceholder.style.color = state.textColor;
    }
  }

  /* ── Event binding ───────────────────────────────────────────────────────── */

  function bindEvents(dialog) {

    // Close buttons
    dialog.querySelector('#neCloseBtn')?.addEventListener('click', close);
    dialog.querySelector('#neCancelBtn')?.addEventListener('click', close);
    dialog.addEventListener('click', e => { if (e.target === dialog) close(); });

    // Color swatches
    dialog.querySelector('#neColorGrid')?.addEventListener('click', e => {
      const swatch = e.target.closest('[data-color]');
      if (!swatch) return;
      state.spineColor = swatch.dataset.color;
      state.textColor  = autoTextColor(state.spineColor);
      dialog.querySelector('#neCustomColor').value = state.spineColor;
      dialog.querySelectorAll('.ne-color-swatch').forEach(s =>
        s.classList.toggle('is-active', s.dataset.color === state.spineColor));
      renderSpinePreview();
    });

    // Custom color picker
    dialog.querySelector('#neCustomColor')?.addEventListener('input', e => {
      state.spineColor = e.target.value;
      state.textColor  = autoTextColor(state.spineColor);
      dialog.querySelectorAll('.ne-color-swatch').forEach(s => s.classList.remove('is-active'));
      renderSpinePreview();
    });

    // Style buttons
    dialog.querySelector('#neStyleRow')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-style]');
      if (!btn) return;
      state.styleId = btn.dataset.style;
      dialog.querySelectorAll('.ne-style-btn').forEach(b =>
        b.classList.toggle('is-active', b.dataset.style === state.styleId));
      renderSpinePreview();
    });

    // Thickness slider
    dialog.querySelector('#neThickness')?.addEventListener('input', e => {
      state.thickness = parseInt(e.target.value);
      const val = dialog.querySelector('#neThicknessVal');
      if (val) val.textContent = state.thickness + 'px';
      renderSpinePreview();
    });

    // Title / author / language → live preview update
    ['#neTitle', '#neAuthor', '#neLanguage'].forEach(sel => {
      dialog.querySelector(sel)?.addEventListener('input', () => {
        state.title  = dialog.querySelector('#neTitle')?.value  || '';
        state.author = dialog.querySelector('#neAuthor')?.value || '';
        renderSpinePreview();
      });
    });

    // Cover upload
    dialog.querySelector('#neCoverInput')?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      state.coverFile = file;
      const url = URL.createObjectURL(file);
      const img = dialog.querySelector('#neCoverImg');
      const placeholder = dialog.querySelector('#neCoverPlaceholder');
      const uploadBtn = dialog.querySelector('.ne-cover-upload-btn');
      if (img) { img.src = url; img.hidden = false; }
      if (placeholder) placeholder.hidden = true;
      if (uploadBtn) uploadBtn.textContent = 'Change Cover';
    });

    // ISBN lookup
    dialog.querySelector('#neIsbnBtn')?.addEventListener('click', () => lookupIsbn(dialog));
    dialog.querySelector('#neIsbn')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); lookupIsbn(dialog); }
    });

    // Form submit
    dialog.querySelector('#neForm')?.addEventListener('submit', e => {
      e.preventDefault();
      submitNewEntry(dialog);
    });
  }

  /* ── ISBN lookup (Open Library) ──────────────────────────────────────────── */

  async function lookupIsbn(dialog) {
    const isbnInput = dialog.querySelector('#neIsbn');
    const status    = dialog.querySelector('#neIsbnStatus');
    const isbn = (isbnInput?.value || '').replace(/[^0-9X]/gi, '');
    if (isbn.length < 10) {
      showIsbnStatus(status, 'Enter a valid ISBN-10 or ISBN-13.', 'error');
      return;
    }
    showIsbnStatus(status, 'Looking up…', 'loading');
    try {
      // Open Library works in browser without CORS issues via this endpoint
      const res  = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
      if (!res.ok) { showIsbnStatus(status, 'Not found. Try entering title manually.', 'error'); return; }
      const book = await res.json();

      const titleInput  = dialog.querySelector('#neTitle');
      const authorInput = dialog.querySelector('#neAuthor');

      if (titleInput && !titleInput.value) titleInput.value = book.title || '';

      // Authors are refs — fetch first author name
      if (authorInput && !authorInput.value && book.authors?.length) {
        const authorKey = book.authors[0].key; // e.g. "/authors/OL123A"
        fetch(`https://openlibrary.org${authorKey}.json`)
          .then(r => r.json())
          .then(a => {
            if (a.name && !authorInput.value) authorInput.value = a.name;
            state.author = authorInput.value;
            renderSpinePreview();
          }).catch(() => {});
      }

      // Cover via ISBN
      const coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
      const img = dialog.querySelector('#neCoverImg');
      const placeholder = dialog.querySelector('#neCoverPlaceholder');
      const uploadBtn = dialog.querySelector('.ne-cover-upload-btn');
      // Test if cover exists (Open Library returns a 1px gif if not found)
      const coverRes = await fetch(coverUrl);
      if (coverRes.ok && coverRes.headers.get('content-length') !== '807') {
        if (img) { img.src = coverUrl; img.hidden = false; }
        if (placeholder) placeholder.hidden = true;
        if (uploadBtn) uploadBtn.textContent = 'Change Cover';
      }

      state.title  = titleInput?.value  || '';
      state.author = authorInput?.value || '';
      renderSpinePreview();
      showIsbnStatus(status, `Found: ${book.title}`, 'ok');
    } catch {
      showIsbnStatus(status, 'Lookup failed. Check your connection.', 'error');
    }
  }

  function showIsbnStatus(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.className = `ne-isbn-status ne-isbn-status--${type}`;
  }

  /* ── Submit ──────────────────────────────────────────────────────────────── */

  function submitNewEntry(dialog) {
    const title = dialog.querySelector('#neTitle')?.value.trim();
    if (!title) {
      dialog.querySelector('#neTitle')?.focus();
      return;
    }

    const style    = SPINE_STYLES.find(s => s.id === state.styleId) || SPINE_STYLES[0];
    const lang     = dialog.querySelector('#neLanguage')?.value || 'en';
    const bookType = dialog.querySelector('#neBookType')?.value || 'nonfiction';
    const tags     = (dialog.querySelector('#neTags')?.value || '')
      .split(',').map(t => t.trim()).filter(Boolean);

    // Generate a stable id from title + timestamp
    const id = 'book-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)
      + '-' + Date.now().toString(36);

    const coverImgSrc = dialog.querySelector('#neCoverImg')?.src || null;
    const coverIsBlob = coverImgSrc?.startsWith('blob:');

    // Resolve panels + aiFeatures from type registry
    const typeConfig   = window.BOOK_TYPES?.[bookType] || {};
    const defaultPanels = typeConfig.defaultPanels || ['overview', 'highlights', 'notes', 'claude-import'];
    const aiFeatures    = typeConfig.defaultAiFeatures || [];

    const fullBook = {
      id,
      title,
      author:   dialog.querySelector('#neAuthor')?.value.trim() || '',
      status:   dialog.querySelector('#neStatus')?.value        || 'reading',
      tags,
      language: lang,
      bookType,
      panels:   defaultPanels,
      aiFeatures,
      year:     new Date().getFullYear(),
      summary:  '',
      cover: {
        bg:     state.spineColor,
        text:   state.textColor,
        font:   style.font,
        weight: style.weight,
        // Only store non-blob URLs (blob URLs don't survive page reload)
        image:  (coverImgSrc && !coverIsBlob) ? coverImgSrc : null,
      },
      meta: {
        startedAt: new Date().toISOString().slice(0, 10),
      },
      highlights: [],
      actions:    [],
    };

    // Register into BOOK_BY_ID and BOOK_DETAILS so book.js can render it
    if (!window.BOOK_DETAILS) window.BOOK_DETAILS = [];
    if (!window.BOOK_BY_ID)   window.BOOK_BY_ID   = {};
    window.BOOK_DETAILS.unshift(fullBook);
    window.BOOK_BY_ID[id] = fullBook;

    // Inject into SHELF_BOOKS so the shelf shows the spine
    if (window.SHELF_BOOKS) {
      window.SHELF_BOOKS.unshift({
        id,
        title:  fullBook.title,
        author: fullBook.author,
        spine:  state.spineColor,
        text:   state.textColor,
        w:      state.thickness,
        h:      0.88,
        status: fullBook.status,
        font:   style.font,
        weight: style.weight,
      });
    }

    // Re-render shelf
    if (typeof window.renderShelfSection === 'function') window.renderShelfSection();

    close();

    // Navigate directly to the new book's detail page
    App.show('book', { id });
  }

  /* ── Public ──────────────────────────────────────────────────────────────── */

  return { mount, open, close };

})();
