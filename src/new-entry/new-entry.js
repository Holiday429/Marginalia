/* ==========================================================================
   Marginalia · Add Book — add a book + DIY spine/cover
   ========================================================================== */

window.NewEntry = (() => {

  /* ── Spine palette ───────────────────────────────────────────────────────── */

  const SPINE_COLORS = [
    // Warm neutrals
    { hex: '#d4c4a0', label: 'Parchment' },
    { hex: '#c4b090', label: 'Sand' },
    { hex: '#b8a882', label: 'Wheat' },
    { hex: '#c89f85', label: 'Clay' },
    { hex: '#b87868', label: 'Terracotta' },
    // Reds
    { hex: '#a84040', label: 'Brick' },
    { hex: '#9a3838', label: 'Crimson' },
    { hex: '#7a3030', label: 'Burgundy' },
    { hex: '#c05840', label: 'Vermilion' },
    { hex: '#c47058', label: 'Rust' },
    // Greens
    { hex: '#4a6e52', label: 'Forest' },
    { hex: '#3d5a46', label: 'Bottle' },
    { hex: '#5a7260', label: 'Sage' },
    { hex: '#aab39a', label: 'Fern' },
    { hex: '#7a8c6a', label: 'Olive' },
    // Blues
    { hex: '#2a4468', label: 'Navy' },
    { hex: '#3a5272', label: 'Slate' },
    { hex: '#3a6080', label: 'Teal' },
    { hex: '#5888c0', label: 'Cobalt' },
    { hex: '#7aabcc', label: 'Sky' },
    // Purples
    { hex: '#5a487a', label: 'Violet' },
    { hex: '#6a5070', label: 'Plum' },
    { hex: '#9890c8', label: 'Lavender' },
    { hex: '#7a6090', label: 'Mauve' },
    // Yellows & gold
    { hex: '#c89836', label: 'Gold' },
    { hex: '#c68b4a', label: 'Amber' },
    { hex: '#ccc070', label: 'Straw' },
    { hex: '#987830', label: 'Ochre' },
    // Pinks & rose
    { hex: '#d4a8b8', label: 'Rose' },
    { hex: '#c06880', label: 'Fuchsia' },
    { hex: '#b0807a', label: 'Blush' },
    // Neutrals mid-range
    { hex: '#6a6260', label: 'Graphite' },
    { hex: '#8a8278', label: 'Stone' },
    { hex: '#a09890', label: 'Dusk' },
    { hex: '#c0bab2', label: 'Fog' },
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

  /* ── Countries with flag emoji ──────────────────────────────────────────── */

  const COUNTRIES = [
    { name: 'Afghanistan', flag: '🇦🇫' }, { name: 'Albania', flag: '🇦🇱' },
    { name: 'Algeria', flag: '🇩🇿' }, { name: 'Argentina', flag: '🇦🇷' },
    { name: 'Armenia', flag: '🇦🇲' }, { name: 'Australia', flag: '🇦🇺' },
    { name: 'Austria', flag: '🇦🇹' }, { name: 'Azerbaijan', flag: '🇦🇿' },
    { name: 'Bangladesh', flag: '🇧🇩' }, { name: 'Belarus', flag: '🇧🇾' },
    { name: 'Belgium', flag: '🇧🇪' }, { name: 'Bolivia', flag: '🇧🇴' },
    { name: 'Brazil', flag: '🇧🇷' }, { name: 'Bulgaria', flag: '🇧🇬' },
    { name: 'Cambodia', flag: '🇰🇭' }, { name: 'Canada', flag: '🇨🇦' },
    { name: 'Chile', flag: '🇨🇱' }, { name: 'China', flag: '🇨🇳' },
    { name: 'Colombia', flag: '🇨🇴' }, { name: 'Croatia', flag: '🇭🇷' },
    { name: 'Cuba', flag: '🇨🇺' }, { name: 'Czech Republic', flag: '🇨🇿' },
    { name: 'Denmark', flag: '🇩🇰' }, { name: 'Ecuador', flag: '🇪🇨' },
    { name: 'Egypt', flag: '🇪🇬' }, { name: 'Estonia', flag: '🇪🇪' },
    { name: 'Ethiopia', flag: '🇪🇹' }, { name: 'Finland', flag: '🇫🇮' },
    { name: 'France', flag: '🇫🇷' }, { name: 'Georgia', flag: '🇬🇪' },
    { name: 'Germany', flag: '🇩🇪' }, { name: 'Ghana', flag: '🇬🇭' },
    { name: 'Greece', flag: '🇬🇷' }, { name: 'Guatemala', flag: '🇬🇹' },
    { name: 'Hungary', flag: '🇭🇺' }, { name: 'Iceland', flag: '🇮🇸' },
    { name: 'India', flag: '🇮🇳' }, { name: 'Indonesia', flag: '🇮🇩' },
    { name: 'Iran', flag: '🇮🇷' }, { name: 'Iraq', flag: '🇮🇶' },
    { name: 'Ireland', flag: '🇮🇪' }, { name: 'Israel', flag: '🇮🇱' },
    { name: 'Italy', flag: '🇮🇹' }, { name: 'Japan', flag: '🇯🇵' },
    { name: 'Jordan', flag: '🇯🇴' }, { name: 'Kazakhstan', flag: '🇰🇿' },
    { name: 'Kenya', flag: '🇰🇪' }, { name: 'South Korea', flag: '🇰🇷' },
    { name: 'Latvia', flag: '🇱🇻' }, { name: 'Lebanon', flag: '🇱🇧' },
    { name: 'Lithuania', flag: '🇱🇹' }, { name: 'Malaysia', flag: '🇲🇾' },
    { name: 'Mexico', flag: '🇲🇽' }, { name: 'Morocco', flag: '🇲🇦' },
    { name: 'Netherlands', flag: '🇳🇱' }, { name: 'New Zealand', flag: '🇳🇿' },
    { name: 'Nigeria', flag: '🇳🇬' }, { name: 'Norway', flag: '🇳🇴' },
    { name: 'Pakistan', flag: '🇵🇰' }, { name: 'Peru', flag: '🇵🇪' },
    { name: 'Philippines', flag: '🇵🇭' }, { name: 'Poland', flag: '🇵🇱' },
    { name: 'Portugal', flag: '🇵🇹' }, { name: 'Romania', flag: '🇷🇴' },
    { name: 'Russia', flag: '🇷🇺' }, { name: 'Saudi Arabia', flag: '🇸🇦' },
    { name: 'Serbia', flag: '🇷🇸' }, { name: 'Singapore', flag: '🇸🇬' },
    { name: 'Slovakia', flag: '🇸🇰' }, { name: 'Slovenia', flag: '🇸🇮' },
    { name: 'South Africa', flag: '🇿🇦' }, { name: 'Spain', flag: '🇪🇸' },
    { name: 'Sri Lanka', flag: '🇱🇰' }, { name: 'Sweden', flag: '🇸🇪' },
    { name: 'Switzerland', flag: '🇨🇭' }, { name: 'Syria', flag: '🇸🇾' },
    { name: 'Taiwan', flag: '🇹🇼' }, { name: 'Thailand', flag: '🇹🇭' },
    { name: 'Tunisia', flag: '🇹🇳' }, { name: 'Turkey', flag: '🇹🇷' },
    { name: 'Ukraine', flag: '🇺🇦' }, { name: 'United Kingdom', flag: '🇬🇧' },
    { name: 'United States', flag: '🇺🇸' }, { name: 'Uruguay', flag: '🇺🇾' },
    { name: 'Uzbekistan', flag: '🇺🇿' }, { name: 'Venezuela', flag: '🇻🇪' },
    { name: 'Vietnam', flag: '🇻🇳' }, { name: 'Yemen', flag: '🇾🇪' },
    { name: 'Zimbabwe', flag: '🇿🇼' },
  ];

  const COUNTRY_TO_ISO = {
    'Afghanistan':'AF','Albania':'AL','Algeria':'DZ','Argentina':'AR','Armenia':'AM',
    'Australia':'AU','Austria':'AT','Azerbaijan':'AZ','Bangladesh':'BD','Belarus':'BY',
    'Belgium':'BE','Bolivia':'BO','Brazil':'BR','Bulgaria':'BG','Cambodia':'KH',
    'Canada':'CA','Chile':'CL','China':'CN','Colombia':'CO','Croatia':'HR',
    'Cuba':'CU','Czech Republic':'CZ','Denmark':'DK','Ecuador':'EC','Egypt':'EG',
    'Estonia':'EE','Ethiopia':'ET','Finland':'FI','France':'FR','Georgia':'GE',
    'Germany':'DE','Ghana':'GH','Greece':'GR','Guatemala':'GT','Hungary':'HU',
    'Iceland':'IS','India':'IN','Indonesia':'ID','Iran':'IR','Iraq':'IQ',
    'Ireland':'IE','Israel':'IL','Italy':'IT','Japan':'JP','Jordan':'JO',
    'Kazakhstan':'KZ','Kenya':'KE','South Korea':'KR','Latvia':'LV','Lebanon':'LB',
    'Lithuania':'LT','Malaysia':'MY','Mexico':'MX','Morocco':'MA','Netherlands':'NL',
    'New Zealand':'NZ','Nigeria':'NG','Norway':'NO','Pakistan':'PK','Peru':'PE',
    'Philippines':'PH','Poland':'PL','Portugal':'PT','Romania':'RO','Russia':'RU',
    'Saudi Arabia':'SA','Serbia':'RS','Singapore':'SG','Slovakia':'SK','Slovenia':'SI',
    'South Africa':'ZA','Spain':'ES','Sri Lanka':'LK','Sweden':'SE','Switzerland':'CH',
    'Syria':'SY','Taiwan':'TW','Thailand':'TH','Tunisia':'TN','Turkey':'TR',
    'Ukraine':'UA','United Kingdom':'GB','United States':'US','Uruguay':'UY',
    'Uzbekistan':'UZ','Venezuela':'VE','Vietnam':'VN','Yemen':'YE','Zimbabwe':'ZW',
  };

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
            <p class="ne-sentiment-hint">Choose colors that capture how this book makes you feel — not just its cover.</p>
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
          <div class="ne-form-scroll">
            <div class="ne-form-head">
              <h2 class="ne-form-title">Add Book</h2>
              <button class="ne-close-btn" type="button" id="neCloseBtn" aria-label="Close">×</button>
            </div>

            <div class="ne-autofill-section">
              <div class="ne-autofill-label">Auto-fill from lookup</div>
              <div class="ne-isbn-row">
                <input class="ne-input ne-isbn-input" id="neIsbn" type="text" placeholder="ISBN — paste to auto-fill">
                <button class="ne-isbn-btn" type="button" id="neIsbnBtn">Lookup</button>
              </div>
              <div class="ne-isbn-status" id="neIsbnStatus"></div>
              <div class="ne-field">
                <label class="ne-label" for="neExternalLink">External Link</label>
                <input class="ne-input" id="neExternalLink" type="url" placeholder="Douban / Amazon URL">
              </div>
            </div>

            <div class="ne-divider"></div>

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
              <div class="ne-country-wrap">
                <input class="ne-input" id="neOrigin" type="text" placeholder="e.g. Japan, United States" autocomplete="off">
                <div class="ne-country-dropdown" id="neCountryDropdown" hidden></div>
              </div>
            </div>

            <div class="ne-field">
              <label class="ne-label" for="neTags">Tags</label>
              <input class="ne-input" id="neTags" type="text" placeholder="e.g. Fiction, History, Philosophy">
              <div class="ne-field-hint">Separate with commas</div>
            </div>
          </div>

          <div class="ne-form-footer">
            <button class="ne-submit-btn" type="submit" id="neSubmitBtn">Add to library</button>
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

    // Country autocomplete
    bindCountryAutocomplete(dialog);

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

  /* ── Country autocomplete ────────────────────────────────────────────────── */

  function bindCountryAutocomplete(dialog) {
    const input = dialog.querySelector('#neOrigin');
    const dropdown = dialog.querySelector('#neCountryDropdown');
    if (!input || !dropdown) return;

    let focusedIndex = -1;

    function showDropdown(matches) {
      if (!matches.length) { dropdown.hidden = true; return; }
      dropdown.innerHTML = matches.map((c, i) =>
        `<div class="ne-country-option" data-name="${c.name}" tabindex="-1">
          <span class="ne-country-flag">${c.flag}</span>
          <span>${c.name}</span>
        </div>`
      ).join('');
      dropdown.hidden = false;
      focusedIndex = -1;
    }

    function pickCountry(name) {
      input.value = name;
      dropdown.hidden = true;
    }

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { dropdown.hidden = true; return; }
      const matches = COUNTRIES.filter(c => c.name.toLowerCase().startsWith(q)).slice(0, 8);
      showDropdown(matches);
    });

    input.addEventListener('keydown', e => {
      if (dropdown.hidden) return;
      const opts = dropdown.querySelectorAll('.ne-country-option');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusedIndex = Math.min(focusedIndex + 1, opts.length - 1);
        opts.forEach((o, i) => o.classList.toggle('is-focused', i === focusedIndex));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusedIndex = Math.max(focusedIndex - 1, 0);
        opts.forEach((o, i) => o.classList.toggle('is-focused', i === focusedIndex));
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
        e.preventDefault();
        pickCountry(opts[focusedIndex].dataset.name);
      } else if (e.key === 'Escape') {
        dropdown.hidden = true;
      }
    });

    dropdown.addEventListener('click', e => {
      const opt = e.target.closest('.ne-country-option');
      if (opt) pickCountry(opt.dataset.name);
    });

    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) dropdown.hidden = true;
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
      // Try Google Books first (best coverage including Chinese books)
      const gbRes  = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
      const gbJson = await gbRes.json();
      const gbItem = gbJson.items?.[0]?.volumeInfo;

      if (gbItem) {
        const titleInput  = dialog.querySelector('#neTitle');
        const authorInput = dialog.querySelector('#neAuthor');
        const lang = dialog.querySelector('#neLanguage')?.value || 'en';
        const isChinese = lang === 'zh';
        // Only fill title/author if empty; never overwrite CJK text with an English translation
        if (titleInput && !titleInput.value && !(isChinese && isCJK(gbItem.title || ''))) {
          titleInput.value = gbItem.title || '';
        }
        if (authorInput && !authorInput.value) {
          authorInput.value = (gbItem.authors || []).join(', ');
        }

        const coverUrl = gbItem.imageLinks?.thumbnail || gbItem.imageLinks?.smallThumbnail || '';
        if (coverUrl) {
          const img = dialog.querySelector('#neCoverImg');
          const placeholder = dialog.querySelector('#neCoverPlaceholder');
          const uploadBtn = dialog.querySelector('.ne-cover-upload-btn');
          if (img) { img.src = coverUrl.replace('http://', 'https://'); img.hidden = false; }
          if (placeholder) placeholder.hidden = true;
          if (uploadBtn) uploadBtn.textContent = 'Change Cover';
        }

        state.title  = titleInput?.value  || '';
        state.author = authorInput?.value || '';
        renderSpinePreview();
        showIsbnStatus(status, `Found: ${gbItem.title}`, 'ok');
        return;
      }

      // Fallback: Open Library
      const olRes  = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
      const olJson = await olRes.json();
      const olBook = olJson[`ISBN:${isbn}`];
      if (!olBook) { showIsbnStatus(status, 'Not found in database. Enter title manually.', 'error'); return; }

      const titleInput  = dialog.querySelector('#neTitle');
      const authorInput = dialog.querySelector('#neAuthor');
      const lang2 = dialog.querySelector('#neLanguage')?.value || 'en';
      if (titleInput && !titleInput.value && !(lang2 === 'zh' && isCJK(olBook.title || ''))) {
        titleInput.value = olBook.title || '';
      }
      if (authorInput && !authorInput.value) {
        authorInput.value = (olBook.authors || []).map(a => a.name).filter(Boolean).join(', ');
      }
      const coverUrl = olBook.cover?.medium || olBook.cover?.large || '';
      if (coverUrl) {
        const img = dialog.querySelector('#neCoverImg');
        const placeholder = dialog.querySelector('#neCoverPlaceholder');
        const uploadBtn = dialog.querySelector('.ne-cover-upload-btn');
        if (img) { img.src = coverUrl; img.hidden = false; }
        if (placeholder) placeholder.hidden = true;
        if (uploadBtn) uploadBtn.textContent = 'Change Cover';
      }
      state.title  = titleInput?.value  || '';
      state.author = authorInput?.value || '';
      renderSpinePreview();
      showIsbnStatus(status, `Found: ${olBook.title}`, 'ok');
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
    const author   = dialog.querySelector('#neAuthor')?.value.trim() || '';
    const status   = dialog.querySelector('#neStatus')?.value || 'reading';
    const originRaw = dialog.querySelector('#neOrigin')?.value.trim() || '';
    const tags     = (dialog.querySelector('#neTags')?.value || '')
      .split(',').map(t => t.trim()).filter(Boolean);

    const id = 'book-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)
      + '-' + Date.now().toString(36);

    const coverImgSrc = dialog.querySelector('#neCoverImg')?.src || null;
    const coverIsBlob = coverImgSrc?.startsWith('blob:');

    const typeConfig    = window.BOOK_TYPES?.[bookType] || {};
    const defaultPanels = typeConfig.defaultPanels || ['overview', 'highlights', 'notes', 'claude-import'];
    const aiFeatures    = typeConfig.defaultAiFeatures || [];

    // Resolve ISO country code from typed name
    const isoCode = originRaw ? resolveIso(originRaw) : null;

    const fullBook = {
      id, title, author, status, tags,
      language: lang, bookType,
      panels: defaultPanels, aiFeatures,
      year: new Date().getFullYear(),
      summary: '',
      cover: {
        bg: state.spineColor, text: state.textColor,
        font: style.font, weight: style.weight,
        image: (coverImgSrc && !coverIsBlob) ? coverImgSrc : null,
      },
      location: isoCode ? { country: isoCode, city: originRaw } : null,
      geo: isoCode ? {
        authorOrigin:    { country: isoCode, city: originRaw },
        contentLocation: { country: isoCode, city: originRaw },
        readerLocation:  null,
      } : null,
      meta: { startedAt: new Date().toISOString().slice(0, 10) },
      highlights: [], actions: [],
    };

    // Register globally
    if (!window.BOOK_DETAILS) window.BOOK_DETAILS = [];
    if (!window.BOOK_BY_ID)   window.BOOK_BY_ID   = {};
    window.BOOK_DETAILS.unshift(fullBook);
    window.BOOK_BY_ID[id] = fullBook;

    // Persist to IndexedDB
    window.NotesStore?.saveBook(fullBook);

    // Spine entry for shelf + library
    const spineEntry = {
      id, title, author,
      spine: state.spineColor,
      text:  state.textColor,
      w:     state.thickness,
      h:     0.88,
      status,
      font:  style.font,
      weight: style.weight,
      loc:   isoCode || undefined,
    };

    // Sync to SHELF_BOOKS + re-render shelf
    if (window.SHELF_BOOKS) {
      window.SHELF_BOOKS.unshift(spineEntry);
    }
    if (typeof window.renderShelfSection === 'function') window.renderShelfSection();

    // Sync to Library (arrival pool)
    if (typeof window.enterStudio === 'function') {
      window.enterStudio();
    }

    // Sync to Map — push into MAP_BOOKS array if accessible
    if (typeof window.mapAddBook === 'function') {
      window.mapAddBook({ ...spineEntry, bg: state.spineColor });
    }

    close();
    App.show('book', { id });
  }

  function resolveIso(raw) {
    const cleaned = raw.trim();
    // Direct match (exact country name)
    if (COUNTRY_TO_ISO[cleaned]) return COUNTRY_TO_ISO[cleaned];
    // Case-insensitive match
    const lower = cleaned.toLowerCase();
    for (const [name, iso] of Object.entries(COUNTRY_TO_ISO)) {
      if (name.toLowerCase() === lower) return iso;
      if (name.toLowerCase().startsWith(lower)) return iso;
    }
    return null;
  }

  /* ── Public ──────────────────────────────────────────────────────────────── */

  return { mount, open, close };

})();
