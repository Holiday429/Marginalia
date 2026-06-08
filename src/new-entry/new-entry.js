/* ==========================================================================
   Marginalia · Add Book — add a book + DIY spine/cover
   ========================================================================== */

import { logEvent, logError } from '../services/analytics.ts';
import { withMeta, withMetaCreate, validateWrite } from '../services/db.ts';
import { BookSchema } from '../data/schema/book.ts';
import { enterLibrary } from '../library-2d/library-2d.js';
import { SEED_BOOK_DETAILS, SEED_BOOK_BY_ID } from '../data/seed/index.js';
import { BooksStore } from '../store/books-store.ts';
import { NotesStore } from '../store/notes-store.js';
import { renderSearchSection } from '../search/search.js';
import { MarginaliaAuth } from '../firebase/auth.js';
import { BOOK_TYPES } from '../data/schema/book-types.js';
import { SPINE_COLORS } from '../shared/spine-colors.js';

export const NewEntry = (() => {

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
    status:       'confirmed-later',
    coverFile:    null,
    coverPreview: null,
  };

  /* ── Mount / unmount ─────────────────────────────────────────────────────── */

  // Tracks the book being edited (null = new book mode)
  let _editBookId = null;

  function mount() {
    document.getElementById('newEntryDialog')?.remove();
    resetState();
    _editBookId = null;

    const dialog = document.createElement('dialog');
    dialog.id = 'newEntryDialog';
    dialog.className = 'ne-dialog';
    dialog.innerHTML = buildHTML();
    document.body.appendChild(dialog);

    bindEvents(dialog);
    open();
  }

  function mountForEdit(book) {
    _editBookId = book.id;
    const existing = document.getElementById('newEntryDialog');
    if (existing) {
      existing.remove();
    }

    const dialog = document.createElement('dialog');
    dialog.id = 'newEntryDialog';
    dialog.className = 'ne-dialog';

    // Pre-populate state from book
    state.spineColor = book.cover?.bg || '#14263e';
    state.textColor  = book.cover?.text || '#e8dfc8';
    state.styleId    = 'classic';
    state.title      = book.title || '';
    state.author     = book.author || '';
    state.thickness  = 34;
    state.coverFile  = null;
    state.coverPreview = book.cover?.image || null;

    dialog.innerHTML = buildHTML();
    document.body.appendChild(dialog);

    // Update form title to indicate edit mode
    const formTitle = dialog.querySelector('.ne-form-title');
    if (formTitle) formTitle.textContent = 'Edit Book';
    const submitBtn = dialog.querySelector('#neSubmitBtn');
    if (submitBtn) submitBtn.textContent = 'Save changes';

    // Pre-fill form fields
    const set = (sel, val) => { const el = dialog.querySelector(sel); if (el && val != null) el.value = val; };
    set('#neTitle',    book.title);
    set('#neAuthor',   book.author);
    set('#neStatus',   toEntryStatus(book.status));
    set('#neLanguage', book.language);
    set('#neBookType', book.bookType);
    set('#neTags',     Array.isArray(book.tags) ? book.tags.join(', ') : (book.tags || ''));
    set('#neExternalLink', book.externalLink || '');

    // Pre-fill country from geo or location
    const country = book.geo?.authorOrigin?.country || book.location?.country || '';
    if (country) {
      const originInput = dialog.querySelector('#neOrigin');
      if (originInput) {
        // Try to reverse-map ISO code to country name
        const name = Object.entries(COUNTRY_TO_ISO).find(([, iso]) => iso === country)?.[0] || country;
        originInput.value = name;
      }
    }

    // Pre-fill cover image if available
    if (book.cover?.image) {
      const img = dialog.querySelector('#neCoverImg');
      const placeholder = dialog.querySelector('#neCoverPlaceholder');
      const uploadBtn = dialog.querySelector('.ne-cover-upload-btn');
      if (img) { img.src = book.cover.image; img.hidden = false; }
      if (placeholder) placeholder.hidden = true;
      if (uploadBtn) uploadBtn.textContent = 'Change Cover';
    }

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

  function resetState() {
    state.spineColor = '#14263e';
    state.textColor = '#e8dfc8';
    state.styleId = 'classic';
    state.title = '';
    state.author = '';
    state.thickness = 34;
    state.height = 0.88;
    state.status = 'confirmed-later';
    state.coverFile = null;
    state.coverPreview = null;
  }

  /* ── HTML ────────────────────────────────────────────────────────────────── */

  function buildHTML() {
    return `
      <div class="ne-layout">

        <!-- Left: Spine preview + DIY controls -->
        <div class="ne-spine-panel">
          <p class="ne-sentiment-hint">Choose colors that capture how this book makes you feel — not just its cover.</p>
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
              <label class="ne-color-swatch ne-color-swatch--rainbow${SPINE_COLORS.some(c => c.hex === state.spineColor) ? '' : ' is-active'}"
                id="neCustomColorTrigger"
                title="Custom Color"
                aria-label="Custom Color">
                <input type="color" id="neCustomColor" value="${state.spineColor}" class="ne-color-picker">
              </label>
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

            <div class="ne-autofill-section ne-field">
              <label class="ne-label" for="neIsbn">ISBN Lookup</label>
              <div class="ne-isbn-row">
                <input class="ne-input ne-isbn-input" id="neIsbn" type="text" placeholder="ISBN — paste to auto-fill">
                <button class="ne-isbn-btn" type="button" id="neIsbnBtn">Lookup</button>
              </div>
              <div class="ne-isbn-status" id="neIsbnStatus" hidden></div>
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
                  <option value="confirmed-later" selected>Confirmed Later</option>
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
            <div class="ne-footer-link-row">
              <label class="ne-label" for="neExternalLink">External Link</label>
              <div class="ne-external-row">
                <input class="ne-input" id="neExternalLink" type="url" placeholder="Douban / Amazon URL">
                <button class="ne-external-btn" type="button" id="neExternalOpenBtn">Open</button>
              </div>
            </div>
            <div class="ne-footer-actions">
              <button class="ne-submit-btn" type="submit" id="neSubmitBtn">Add to library</button>
              <button class="ne-cancel-btn" type="button" id="neCancelBtn">Cancel</button>
            </div>
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

    // Remove any existing author element (author no longer shown on spine)
    wrap.querySelector('.ne-spine-author')?.remove();

    // Cover preview bg color sync
    const coverPlaceholder = document.getElementById('neCoverPlaceholder');
    if (coverPlaceholder) {
      coverPlaceholder.style.background = state.spineColor;
      coverPlaceholder.style.color = state.textColor;
    }
    const coverPreview = document.getElementById('neCoverPreview');
    if (coverPreview) {
      coverPreview.style.setProperty('--ne-spine-bg', state.spineColor);
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
      const customTrigger = e.target.closest('#neCustomColorTrigger');
      if (customTrigger) {
        if (e.target?.id !== 'neCustomColor') {
          const picker = dialog.querySelector('#neCustomColor');
          if (picker) {
            if (typeof picker.showPicker === 'function') picker.showPicker();
            else picker.click();
          }
        }
        return;
      }
      const swatch = e.target.closest('[data-color]');
      if (!swatch) return;
      state.spineColor = swatch.dataset.color;
      state.textColor  = autoTextColor(state.spineColor);
      dialog.querySelector('#neCustomColor').value = state.spineColor;
      dialog.querySelector('#neCustomColorTrigger')?.classList.remove('is-active');
      dialog.querySelectorAll('.ne-color-swatch').forEach(s =>
        s.classList.toggle('is-active', s.dataset.color === state.spineColor));
      renderSpinePreview();
    });

    // Custom color picker
    dialog.querySelector('#neCustomColor')?.addEventListener('input', e => {
      state.spineColor = e.target.value;
      state.textColor  = autoTextColor(state.spineColor);
      dialog.querySelectorAll('.ne-color-swatch').forEach(s => s.classList.remove('is-active'));
      dialog.querySelector('#neCustomColorTrigger')?.classList.add('is-active');
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

    // Tags input: Enter confirms the current token and keeps editing.
    dialog.querySelector('#neTags')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleTagsEnter(e);
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
    dialog.querySelector('#neIsbn')?.addEventListener('paste', () => {
      // auto-lookup after paste settles
      setTimeout(() => lookupIsbn(dialog), 100);
    });
    dialog.querySelector('#neExternalOpenBtn')?.addEventListener('click', () => openExternalLink(dialog));
    dialog.querySelector('#neExternalLink')?.addEventListener('input', () => syncExternalLinkButton(dialog));
    syncExternalLinkButton(dialog);

    // Form submit
    dialog.querySelector('#neForm')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target?.id === 'neTags') handleTagsEnter(e);
    }, true);
    dialog.querySelector('#neForm')?.addEventListener('submit', e => {
      e.preventDefault();
      submitNewEntry(dialog);
    });
  }

  function handleTagsEnter(event) {
    if (event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    const input = event.target;
    if (!input) return;
    const value = String(input.value || '').trim();
    if (!value || /[,，]$/.test(value)) return;
    input.value = `${value}, `;
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
    const status = dialog.querySelector('#neIsbnStatus');
    const rawIsbn = dialog.querySelector('#neIsbn')?.value || '';
    const isbn = normalizeIsbn(rawIsbn);
    if (isbn.length !== 10 && isbn.length !== 13) {
      showLookupStatus(status, `ISBN must be 10 or 13 digits (got ${isbn.length}). Remove hyphens and spaces.`, 'error');
      return;
    }
    showLookupStatus(status, 'Looking up by ISBN…', 'loading');
    try {
      const lookupData = await fetchBookByIsbn(isbn);
      if (!lookupData) {
        showLookupStatus(status, 'No match found. Enter details manually.', 'error');
        return;
      }
      applyLookupData(dialog, lookupData);
      showLookupStatus(status, `Auto-filled from ISBN: ${lookupData.title || 'book record found'}`, 'ok');
    } catch (err) {
      logError(err instanceof Error ? err : new Error(String(err)), { context: 'NewEntry ISBN lookup', isbn });
      showLookupStatus(status, 'Lookup failed. Check your connection.', 'error');
    }
  }

  function showLookupStatus(el, msg, type) {
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      el.className = 'ne-isbn-status';
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    el.className = `ne-isbn-status ne-isbn-status--${type}`;
  }

  async function fetchBookByIsbn(isbn) {
    const isbnVariants = getIsbnVariants(isbn);

    for (const v of isbnVariants) {
      try {
        const query = encodeURIComponent(`isbn:${v}`);
        const gbRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=5`);
        if (gbRes.ok) {
          const gbJson = await gbRes.json();
          const gbInfo = (gbJson.items || []).find(item => item?.volumeInfo?.title)?.volumeInfo;
          if (gbInfo) return mapGoogleBookToLookup(gbInfo);
        }
      } catch { /* try OpenLibrary */ }
    }

    for (const v of isbnVariants) {
      try {
        const olRes = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${v}&format=json&jscmd=data`);
        if (olRes.ok) {
          const olJson = await olRes.json();
          const olBook = olJson[`ISBN:${v}`];
          if (olBook) return mapOpenLibraryBookToLookup(olBook);
        }
      } catch { /* try next variant */ }
    }
    return null;
  }

  function normalizeIsbn(raw) {
    return String(raw || '').replace(/[^0-9X]/gi, '').toUpperCase();
  }

  function getIsbnVariants(isbn) {
    const variants = new Set([isbn]);
    if (isbn.length === 13 && isbn.startsWith('978')) {
      const isbn10 = toIsbn10(isbn);
      if (isbn10) variants.add(isbn10);
    }
    if (isbn.length === 10) {
      const isbn13 = toIsbn13(isbn);
      if (isbn13) variants.add(isbn13);
    }
    return [...variants];
  }

  function toIsbn10(isbn13) {
    const core = isbn13.slice(3, 12);
    if (!/^\d{9}$/.test(core)) return '';
    const check = (11 - (core.split('').reduce((s, d, i) => s + (10 - i) * Number(d), 0) % 11)) % 11;
    return core + (check === 10 ? 'X' : String(check));
  }

  function toIsbn13(isbn10) {
    const core = `978${isbn10.slice(0, 9)}`;
    if (!/^\d{12}$/.test(core)) return '';
    const sum = core.split('').reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
    return core + String((10 - (sum % 10)) % 10);
  }

  function mapGoogleBookToLookup(info) {
    return {
      title: info.title || '',
      author: (info.authors || []).filter(Boolean).join(', '),
      language: normalizeLanguage(info.language),
      tags: (info.categories || []).slice(0, 4),
      coverUrl: (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '').replace('http://', 'https://'),
      origin: '',
      bookType: inferBookType(info.categories || []),
    };
  }

  function mapOpenLibraryBookToLookup(book) {
    return {
      title: book.title || '',
      author: (book.authors || []).map(a => a?.name).filter(Boolean).join(', '),
      language: normalizeLanguage(book.languages?.[0]?.key?.split('/').pop()),
      tags: (book.subjects || []).slice(0, 4).map(s => typeof s === 'string' ? s : s?.name).filter(Boolean),
      coverUrl: book.cover?.large || book.cover?.medium || '',
      origin: '',
      bookType: inferBookType((book.subjects || []).map(s => typeof s === 'string' ? s : s?.name).filter(Boolean)),
    };
  }

  function applyLookupData(dialog, data, opts = {}) {
    const keepExistingCover = Boolean(opts.keepExistingCover);
    const titleInput = dialog.querySelector('#neTitle');
    const authorInput = dialog.querySelector('#neAuthor');
    const languageInput = dialog.querySelector('#neLanguage');
    const bookTypeInput = dialog.querySelector('#neBookType');
    const tagsInput = dialog.querySelector('#neTags');
    const originInput = dialog.querySelector('#neOrigin');

    if (titleInput && data.title) titleInput.value = data.title;
    if (authorInput && data.author) authorInput.value = data.author;
    if (languageInput && data.language) languageInput.value = data.language;
    if (bookTypeInput && data.bookType) bookTypeInput.value = data.bookType;
    if (tagsInput && Array.isArray(data.tags) && data.tags.length) tagsInput.value = data.tags.join(', ');
    if (originInput && data.origin) originInput.value = data.origin;

    const img = dialog.querySelector('#neCoverImg');
    const hasCurrentCover = Boolean(img?.src);
    if (data.coverUrl && (!keepExistingCover || !hasCurrentCover)) {
      const placeholder = dialog.querySelector('#neCoverPlaceholder');
      const uploadBtn = dialog.querySelector('.ne-cover-upload-btn');
      if (img) {
        img.src = data.coverUrl;
        img.hidden = false;
      }
      if (placeholder) placeholder.hidden = true;
      if (uploadBtn) uploadBtn.textContent = 'Change Cover';
    }

    state.title = titleInput?.value || '';
    state.author = authorInput?.value || '';
    renderSpinePreview();
  }

  function inferBookType(tags) {
    const joined = (tags || []).join(' ').toLowerCase();
    if (!joined) return 'nonfiction';
    if (/(novel|fiction|literary|story)/.test(joined)) return 'fiction';
    if (/(philosophy|economics|sociology|politics|social)/.test(joined)) return 'social';
    if (/(travel|journey|place|city|geography)/.test(joined)) return 'travel';
    if (/(essay|self-help|memoir|life)/.test(joined)) return 'essay';
    return 'nonfiction';
  }

  function normalizeLanguage(lang) {
    const raw = String(lang || '').toLowerCase();
    if (raw.startsWith('zh') || raw === 'chi' || raw === 'zho') return 'zh';
    if (raw.startsWith('en') || raw === 'eng') return 'en';
    if (!raw) return '';
    return 'other';
  }

  function toEntryStatus(status) {
    const raw = String(status || '').trim();
    if (raw === 'read') return 'finished';
    if (raw === 'unread' || raw === 'wishlist') return 'want';
    if (raw === 'reading' || raw === 'finished' || raw === 'want' || raw === 'confirmed-later') return raw;
    return 'confirmed-later';
  }

  function normalizeUrl(raw) {
    try {
      const maybePrefixed = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const url = new URL(maybePrefixed);
      return url.toString();
    } catch {
      return '';
    }
  }

  function syncExternalLinkButton(dialog) {
    const btn = dialog.querySelector('#neExternalOpenBtn');
    const raw = dialog.querySelector('#neExternalLink')?.value || '';
    if (!btn) return;
    btn.disabled = !normalizeUrl(raw);
  }

  function openExternalLink(dialog) {
    const status = dialog.querySelector('#neIsbnStatus');
    const raw = (dialog.querySelector('#neExternalLink')?.value || '').trim();
    const url = normalizeUrl(raw);
    if (!url) {
      showLookupStatus(status, 'Enter a valid external link first.', 'error');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /* ── Submit ──────────────────────────────────────────────────────────────── */

  async function submitNewEntry(dialog) {
    const title = dialog.querySelector('#neTitle')?.value.trim();
    if (!title) {
      dialog.querySelector('#neTitle')?.focus();
      return;
    }

    const style    = SPINE_STYLES.find(s => s.id === state.styleId) || SPINE_STYLES[0];
    const lang     = dialog.querySelector('#neLanguage')?.value || 'en';
    const bookType = dialog.querySelector('#neBookType')?.value || 'nonfiction';
    const author   = dialog.querySelector('#neAuthor')?.value.trim() || '';
    const status   = dialog.querySelector('#neStatus')?.value || 'confirmed-later';
    const originRaw = dialog.querySelector('#neOrigin')?.value.trim() || '';
    const externalLink = normalizeUrl(dialog.querySelector('#neExternalLink')?.value || '');
    const tags     = (dialog.querySelector('#neTags')?.value || '')
      .split(',').map(t => t.trim()).filter(Boolean);

    // Resolve cover image: prefer already-converted data URL, then convert blob
    let coverImageUrl = null;
    const coverImg = dialog.querySelector('#neCoverImg');
    if (coverImg && !coverImg.hidden && coverImg.src) {
      if (coverImg.src.startsWith('blob:')) {
        // Convert blob URL to data URL so it persists after the dialog closes
        try {
          const resp = await fetch(coverImg.src);
          const blob = await resp.blob();
          coverImageUrl = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(blob);
          });
        } catch { /* fall back to null */ }
      } else if (coverImg.src.startsWith('data:') || coverImg.src.startsWith('http')) {
        coverImageUrl = coverImg.src;
      }
    }
    const isoCode = originRaw ? resolveIso(originRaw) : null;

    const isEditing = Boolean(_editBookId);
    const existingBook = isEditing ? BooksStore.getById(_editBookId) : null;
    const id = isEditing ? _editBookId : (
      'book-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)
        + '-' + Date.now().toString(36)
    );

    const typeConfig    = BOOK_TYPES?.[bookType] || {};
    const defaultPanels = typeConfig.defaultPanels || ['overview', 'highlights', 'notes', 'actions'];
    const aiFeatures    = typeConfig.defaultAiFeatures || [];

    const fullBook = {
      ...(existingBook || {}),
      id, title, author, status, tags,
      language: lang, bookType,
      panels: defaultPanels, aiFeatures,
      year: existingBook?.year || new Date().getFullYear(),
      summary: existingBook?.summary || '',
      cover: {
        ...(existingBook?.cover || {}),
        bg: state.spineColor, text: state.textColor,
        font: style.font, weight: style.weight,
        ...(coverImageUrl ? { image: coverImageUrl } : {}),
      },
      location: isoCode ? { country: isoCode, city: originRaw } : (existingBook?.location || null),
      externalLink: externalLink || existingBook?.externalLink || null,
      geo: isoCode ? {
        authorOrigin:    { country: isoCode, city: originRaw },
        contentLocation: { country: isoCode, city: originRaw },
        readerLocation:  null,
      } : (existingBook?.geo || null),
      meta: existingBook?.meta || { startedAt: new Date().toISOString().slice(0, 10) },
      highlights: existingBook?.highlights || [],
      actions: existingBook?.actions || [],
    };

    logEvent(isEditing ? 'book_edited' : 'book_added', { bookId: id, status });

    const auth = MarginaliaAuth;
    const uid  = auth?.user?.uid;
    const db   = auth?.db;

    if (uid && db) {
      try {
        const wsId = (window.MARGINALIA_FIREBASE?.workspaceId) || 'default';
        const docRef = db
          .collection('workspaces').doc(wsId)
          .collection('users').doc(uid)
          .collection('books').doc(id);
        if (isEditing) {
          // Patch only the fields that changed
          const patch = {
            title, author, status, tags, language: lang, bookType,
            panels: defaultPanels, aiFeatures,
            cover: fullBook.cover,
            location: fullBook.location,
            externalLink: fullBook.externalLink,
            geo: fullBook.geo,
          };
          const validated = validateWrite(BookSchema, patch);
          await docRef.set(withMeta(validated), { merge: true });
        } else {
          const validated = validateWrite(BookSchema, fullBook);
          const payload   = withMetaCreate(validated);
          await docRef.set(payload);
        }
        BooksStore.addOptimisticBook(fullBook);
      } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)), { context: `NewEntry Firestore ${isEditing ? 'edit' : 'write'}` });
      }
    } else {
      SEED_BOOK_DETAILS.unshift(fullBook);
      SEED_BOOK_BY_ID[id] = fullBook;
      NotesStore?.saveBook(fullBook);
      BooksStore.addOptimisticBook(fullBook);
    }
    renderSearchSection();
    enterLibrary();

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

  return { mount, open, close, mountForEdit };

})();
