/* ==========================================================================
   Marginalia · Book detail view
   ========================================================================== */

import './book.css';
import { logEvent, logError } from '../services/analytics.ts';
import { BooksStore } from '../store/books-store.ts';
import { HighlightsStore } from '../store/highlights-store.ts';
import { ActionsStore } from '../store/actions-store.ts';
import { NotesStore } from '../store/notes-store.ts';
import { renderSearchSection } from '../search/search.js';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { MarginaliaStorage, MarginaliaBooksCloud } from '../firebase/db.ts';
import { MarginaliaAuth } from '../firebase/auth.ts';
import { renderUnifiedPanelHeader, renderToolPageShell } from '../core/app.ts';
import { PanelManager } from '../core/panel-manager.ts';
import { PanelRegistry } from './panels/registry.ts';
// Register panel render functions (side-effect imports).
import './panels/mindmap.js';
import './panels/concept-cards.js';
import './panels/timeline.js';
import './panels/characters.js';
import './panels/geo-context.js';
import { buildBookDetailModel, BOOK_SECTION_LABELS } from './book-detail.js';
import { MarginaliaGraph } from '../core/graph-data.ts';
import { openConceptDrawer } from '../core/concept-ui.ts';
import { AIGenerateUI } from '../ai/client/generate-ui.ts';
import { KindleImport } from '../api/kindle-import.ts';
import { SEED_BOOK_BY_ID } from '../data/seed/index.js';
import { generateReadingCardBlob, fetchReadingCardAI } from './reading-card.ts';
import { ENV } from '../core/env.ts';
import { HeroBook } from '../components/hero-book/hero-book.ts';
import '../components/hero-book/hero-book.css';
import { NewEntry } from '../new-entry/new-entry.ts';

let __currentBookId = null;

function initBook() {}

async function enterBook(params = {}) {
  const fallbackId = BooksStore.getAll()[0]?.id || 'sapiens';
  const id = params.id || __currentBookId || fallbackId;
  const publicSlug = String(params.publicSlug || '').trim().toLowerCase();
  const publicView = Boolean(publicSlug);
  let noteContent = '';
  let liveHighlights = [];
  let book = null;

  if (publicView) {
    const publicBook = await fetchPublicBookContext(publicSlug, id);
    if (!publicBook) {
      renderMissingBookState('This shared book is not available.');
      return;
    }
    book = publicBook.book;
    liveHighlights = publicBook.highlights;
    noteContent = publicBook.noteContent;
  } else {
    const storeBook = BooksStore.getById(id);
    if (MarginaliaAuth.user) {
      book = storeBook || null;
    } else {
      const seedBook = SEED_BOOK_BY_ID[id];
      book = storeBook || seedBook || null;
    }
  }

  if (!book) { logError(new Error(`[book] No record for id="${id}"`), { bookId: id }); return; }
  __currentBookId = id;

  // Merge live user highlights from HighlightsStore (Firestore) with any
  // seed highlights baked into the book object. View-local copy — seed never mutated.
  if (!publicView) {
    liveHighlights = HighlightsStore.getUid()
      ? HighlightsStore.getAll().filter((h) => h.bookId === id)
      : ((await NotesStore?.getHighlights(id)) || []);
  }
  const mergedHighlights = dedupeHighlights([...(book.highlights || []), ...liveHighlights]);

  // Merge actions: ActionsStore (Firestore) takes precedence over any actions
  // baked into the book object (seed data). For unauthenticated users the
  // book-embedded actions array is used as-is.
  const liveActions = ActionsStore.getUid()
    ? ActionsStore.getByBook(id)
    : (book.actions || []);
  const rawBookView = {
    ...book,
    ...(mergedHighlights.length ? { highlights: mergedHighlights } : {}),
    ...(ActionsStore.getUid() ? { actions: liveActions } : {}),
    noteContent,
    isReadOnly: publicView,
  };
  const bookView = buildBookDetailModel(rawBookView);
  if (publicView) bookView.sections = ['overview', 'highlights', 'notes'];

  const root = document.getElementById('panel-book');
  const sections = getBookSections(bookView);
  root.innerHTML = renderBook(bookView, sections);

  // Re-mount registered panels onto their live DOM nodes so event listeners
  // survive the innerHTML serialisation round-trip (mountFn is set by
  // _renderPanelSection for panels that use PanelRegistry.render()).
  sections.forEach((s) => {
    if (s.mountFn) {
      const liveEl = root.querySelector(`#${CSS.escape(s.id)}`);
      if (liveEl) s.mountFn(liveEl);
    }
  });

  // Mount AI generate toolbars
  if (!publicView) AIGenerateUI?.mount(bookView, root);

  // Wire up sidebar tabs
  const outline = root.querySelector('.book-outline');
  const shell = root.querySelector('.book-detail-shell');
  const toggleBtn = root.querySelector('.book-outline-toggle');

  root.querySelectorAll('.book-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;

      root.querySelectorAll('.book-tab-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      root.querySelectorAll('.book-section').forEach(s => {
        s.classList.toggle('is-active', s.id === target);
      });
    });
  });

  // Sidebar collapse toggle — triangle button switches between
  // expanded (full section labels) and collapsed (triangle only).
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const willCollapse = !outline.classList.contains('is-collapsed');
      outline.classList.toggle('is-collapsed', willCollapse);
      shell.classList.toggle('is-outline-collapsed', willCollapse);
      toggleBtn.setAttribute('aria-expanded', willCollapse ? 'false' : 'true');
    });
  }

  // Wire up annotation collapse toggles (annotations are expanded by default)
  root.querySelectorAll('.hl-annotation-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const hlBody = btn.closest('.hl-body');
      const ann = hlBody?.querySelector('[data-hl-annotation]');
      if (!ann) return;
      const collapsed = ann.classList.toggle('is-collapsed');
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      const icon = btn.querySelector('.tog-icon');
      if (icon) icon.textContent = collapsed ? '+' : '−';
    });
  });

  // Highlight add form
  const hlAddBtn    = root.querySelector('#hlAddBtn');
  const hlForm      = root.querySelector('#hlForm');
  const hlFormCancel = root.querySelector('#hlFormCancel');
  if (hlAddBtn && hlForm) {
    hlAddBtn.addEventListener('click', () => {
      hlForm.hidden = false;
      hlAddBtn.hidden = true;
      hlForm.querySelector('#hlFormQuote')?.focus();
    });
    hlFormCancel?.addEventListener('click', () => {
      hlForm.hidden = true;
      hlAddBtn.hidden = false;
      hlForm.reset();
    });
    hlForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const quote = hlForm.querySelector('#hlFormQuote')?.value.trim();
      if (!quote) return;
      const highlight = {
        quote,
        page:       parseInt(hlForm.querySelector('#hlFormPage')?.value) || null,
        kind:       hlForm.querySelector('#hlFormKind')?.value || null,
        chapter:    hlForm.querySelector('#hlFormChapter')?.value.trim() || null,
        annotation: hlForm.querySelector('#hlFormNote')?.value.trim() || null,
      };
      await NotesStore?.saveHighlight(id, highlight);
      logEvent('highlight_saved', { bookId: id });
      // Re-enter to rebuild merged list
      enterBook({ id });
    });
  }

  // Kindle import zone toggle
  const hlKindleBtn  = root.querySelector('#hlKindleBtn');
  const hlKindleZone = root.querySelector('#hlKindleZone');
  if (hlKindleBtn && hlKindleZone && KindleImport) {
    hlKindleBtn.addEventListener('click', () => {
      const open = hlKindleZone.hidden;
      hlKindleZone.hidden = !open;
      if (open && !hlKindleZone.dataset.mounted) {
        KindleImport.mountUI(hlKindleZone);
        hlKindleZone.dataset.mounted = '1';
      }
    });
    hlKindleZone.addEventListener('kindle:imported', () => enterBook({ id }));
  }

  // Highlight delete (user-created only)
  root.querySelectorAll('[data-hl-delete]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const hlId = btn.dataset.hlDelete;
      if (!hlId) return;
      await NotesStore?.deleteHighlight(id, hlId);
      enterBook({ id });
    });
  });

  // Wire up action items — persist status to ActionsStore (Firestore) when
  // authenticated, falling back to NotesStore (IndexedDB) for demo visitors.
  const isAuthed = !!ActionsStore.getUid();
  root.querySelectorAll('.action-item').forEach(item => {
    const actionId = item.dataset.id;
    if (!actionId) return;

    // Initial state is already rendered by renderActions() from the live
    // ActionsStore snapshot. For unauthenticated visitors, read from IndexedDB.
    if (!isAuthed) {
      NotesStore?.getActionStatus(id, actionId).then(saved => {
        if (saved === null) return;
        item.classList.toggle('done', saved === 'done');
        const tag = item.querySelector('.action-tag');
        if (tag) tag.textContent = saved === 'done' ? 'Completed' : 'Pending';
      }).catch(e => logError(e, { context: 'book action status load' }));
    }

    item.addEventListener('click', () => {
      const willBeDone = !item.classList.contains('done');
      item.classList.toggle('done', willBeDone);
      const tag = item.querySelector('.action-tag');
      if (tag) tag.textContent = willBeDone ? 'Completed' : 'Pending';

      if (isAuthed) {
        const op = willBeDone
          ? ActionsStore.markDone(actionId, id)
          : ActionsStore.reopen(actionId);
        op.catch(e => logError(e, { context: 'book action status save' }));
      } else {
        NotesStore?.setActionStatus(id, actionId, willBeDone ? 'done' : 'todo');
      }
    });
  });

  root.querySelectorAll('[data-open-concept-id]').forEach((item) => {
    item.addEventListener('click', () => {
      const conceptId = item.dataset.openConceptId;
      if (!conceptId) return;
      openConceptDrawer(conceptId, { focusBookId: id });
    });
  });

  const uploadBtn = root.querySelector('[data-upload-cover-btn]');
  const uploadInput = root.querySelector('[data-upload-cover-input]');
  const uploadStatus = root.querySelector('[data-upload-cover-status]');
  if (uploadBtn && uploadInput) {
    uploadBtn.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', async () => {
      const file = uploadInput.files?.[0];
      if (!file) return;
      if (uploadStatus) uploadStatus.textContent = 'Uploading...';
      try {
        let imageUrl = '';
        let storagePath = '';

        if (MarginaliaStorage?.isEnabled?.()) {
          // Firebase Storage path
          const uploaded = await MarginaliaStorage.uploadCoverImage({ file, bookId: id });
          imageUrl = uploaded.downloadURL;
          storagePath = uploaded.path;
        } else {
          // Fallback: encode as data URL and save inline
          imageUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }

        // Update BooksStore optimistically
        const currentBook = BooksStore.getById(id);
        if (currentBook) {
          BooksStore.addOptimisticBook({ ...currentBook, cover: { ...(currentBook.cover || {}), image: imageUrl } });
        }

        await MarginaliaBooksCloud?.setBookCover({ bookId: id, imageUrl, storagePath });
        if (uploadStatus) uploadStatus.textContent = 'Saved';
        enterBook({ id });
      } catch (error) {
        logError(error, { context: 'book cover upload', bookId: id });
        if (uploadStatus) uploadStatus.textContent = 'Upload failed';
      } finally {
        uploadInput.value = '';
      }
    });
  }


  // ── Overview: stat cards → jump to tab ───────────────────────────────
  root.querySelectorAll('.ov-stat-card[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabBtn = root.querySelector(`.book-tab-btn[data-target="${CSS.escape(btn.dataset.target)}"]`);
      if (tabBtn) tabBtn.click();
    });
  });

  // ── Overview: tags ────────────────────────────────────────────────────
  const tagsRoot = root.querySelector('[data-ov-tags]');
  const tagForm  = root.querySelector('[data-tag-form]');
  const tagInput = root.querySelector('[data-tag-input]');

  root.querySelector('[data-add-tag]')?.addEventListener('click', () => {
    tagForm.hidden = false;
    root.querySelector('[data-add-tag]').hidden = true;
    tagInput?.focus();
  });
  root.querySelector('[data-cancel-tag]')?.addEventListener('click', () => {
    tagForm.hidden = true;
    root.querySelector('[data-add-tag]').hidden = false;
    if (tagInput) tagInput.value = '';
  });
  tagForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newTag = tagInput?.value.trim();
    if (!newTag) return;
    const current = Array.from(root.querySelectorAll('.ov-tag')).map(el => el.firstChild?.textContent?.trim()).filter(Boolean);
    if (current.includes(newTag)) { tagForm.hidden = true; return; }
    const updated = [...current, newTag];
    try {
      await MarginaliaBooksCloud?.setBookTags?.({ bookId: id, tags: updated });
    } catch (err) { logError(err, { context: 'book tags save', bookId: id }); }
    enterBook({ id });
  });
  root.querySelectorAll('[data-remove-tag]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const remove = btn.dataset.removeTag;
      const current = Array.from(root.querySelectorAll('.ov-tag')).map(el => el.firstChild?.textContent?.trim()).filter(Boolean);
      const updated = current.filter(t => t !== remove);
      try {
        await MarginaliaBooksCloud?.setBookTags?.({ bookId: id, tags: updated });
      } catch (err) { logError(err, { context: 'book tag remove', bookId: id }); }
      enterBook({ id });
    });
  });

  // ── Overview: rating (half-star support) ─────────────────────────────
  root.querySelector('[data-ov-rating]')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-star]');
    if (!btn) return;
    const val = parseFloat(btn.dataset.star);
    if (isNaN(val)) return;

    // Re-render star row in place with new value
    const ratingRoot = root.querySelector('[data-ov-rating]');
    if (ratingRoot) ratingRoot.innerHTML = renderStarRow(val, false);

    // Update numeric display
    const numEl = root.querySelector('[data-rating-num]');
    if (numEl) numEl.innerHTML = `${val}/5<sup>/5</sup>`;

    // Remove "Tap to rate" hint once rated
    root.querySelector('.rating-note')?.remove();

    // Optimistic update in BooksStore
    const currentBook = BooksStore.getById(id);
    if (currentBook) BooksStore.addOptimisticBook({ ...currentBook, rating: val });

    try {
      await MarginaliaBooksCloud?.setBookRating?.({ bookId: id, rating: val });
    } catch (err) { logError(err, { context: 'book rating save', bookId: id }); }
  });

  // ── Overview: reading progress ────────────────────────────────────────
  root.querySelector('[data-progress-select]')?.addEventListener('change', async (e) => {
    const val = e.target.value;
    const statusMap = { 'done': 'read', 'in-progress': 'reading', 'not-started': 'confirmed-later' };
    const newStatus = statusMap[val] || 'confirmed-later';
    const currentBook = BooksStore.getById(id) || book;
    BooksStore.addOptimisticBook({ ...currentBook, status: newStatus, meta: { ...(currentBook.meta || {}), readingProgress: val } });
    try {
      await MarginaliaBooksCloud?.setBookProgress?.({ bookId: id, readingProgress: val });
    } catch (err) { logError(err, { context: 'book progress save', bookId: id }); }
  });

  // ── Overview: Douban link ─────────────────────────────────────────────
  root.querySelector('[data-edit-douban]')?.addEventListener('click', () => {
    root.querySelector('[data-douban-field]').querySelector('a, button')?.setAttribute('hidden', '');
    root.querySelector('[data-edit-douban]')?.setAttribute('hidden', '');
    root.querySelector('[data-douban-form]').hidden = false;
    root.querySelector('[data-douban-input]')?.focus();
  });
  root.querySelector('[data-cancel-douban]')?.addEventListener('click', () => {
    root.querySelector('[data-douban-form]').hidden = true;
    root.querySelector('[data-edit-douban]')?.removeAttribute('hidden');
  });
  root.querySelector('[data-douban-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = root.querySelector('[data-douban-input]')?.value.trim() || '';
    try {
      await MarginaliaBooksCloud?.setBookDouban?.({ bookId: id, douban: url });
    } catch (err) { logError(err, { context: 'book douban save', bookId: id }); }
    enterBook({ id });
  });

  // ── Overview: external link ────────────────────────────────────────────
  root.querySelector('[data-edit-ext-link]')?.addEventListener('click', () => {
    root.querySelector('[data-ext-link-field]').querySelector('a, button')?.setAttribute('hidden', '');
    root.querySelector('[data-edit-ext-link]')?.setAttribute('hidden', '');
    root.querySelector('[data-ext-link-form]').hidden = false;
    root.querySelector('[data-ext-link-input]')?.focus();
  });
  root.querySelector('[data-cancel-ext-link]')?.addEventListener('click', () => {
    root.querySelector('[data-ext-link-form]').hidden = true;
    root.querySelector('[data-edit-ext-link]')?.removeAttribute('hidden');
  });
  root.querySelector('[data-ext-link-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = root.querySelector('[data-ext-link-input]')?.value.trim() || '';
    try {
      await MarginaliaBooksCloud?.updateBook?.({ bookId: id, patch: { externalLink: url || null } });
    } catch (err) { logError(err, { context: 'book ext-link save', bookId: id }); }
    enterBook({ id });
  });

  // ── Overview: Wire up knowledge structure inner tabs
  root.querySelectorAll('.mm-top-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const paneId = tab.dataset.mmTab;
      const section = tab.closest('.mindmap-section');
      section.querySelectorAll('.mm-top-tab').forEach(t => t.classList.toggle('is-active', t === tab));
      section.querySelectorAll('.mm-tab-pane').forEach(p => {
        p.classList.toggle('is-active', p.dataset.mmPane === paneId);
      });
    });
  });

  // Wire up revolution inner tabs
  root.querySelectorAll('.mm-rev-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const revId = tab.dataset.mmRevTab;
      const wrap = tab.closest('.mm-tab-pane');
      wrap.querySelectorAll('.mm-rev-tab').forEach(t => t.classList.toggle('is-active', t === tab));
      wrap.querySelectorAll('.mm-rev-card').forEach(c => {
        c.classList.toggle('is-active', c.dataset.mmRevPane === revId);
      });
    });
  });

  // Wire up Related Books actions
  root.querySelectorAll('.connection-action--open').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const bookId = btn.dataset.bookId;
      if (bookId && BooksStore.getById(bookId)) PanelManager.open('book', { id: bookId });
    });
  });
  root.querySelectorAll('.connection-action--add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // NewEntry has no prefill API yet — open a blank form rather than the
      // previous App.show('new-entry', ...) call, which always threw
      // (App has no 'new-entry' view and was never imported in this file).
      NewEntry?.mount();
    });
  });
  // Overview related strip — card click → open book, see-all → switch tab
  root.querySelectorAll('.ov-rel-card.is-openable').forEach(card => {
    card.addEventListener('click', () => {
      const bookId = card.dataset.bookId;
      if (bookId) PanelManager.open('book', { id: bookId });
    });
  });
  root.querySelectorAll('.ov-related-see-all[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabBtn = root.querySelector(`.book-tab-btn[data-target="${CSS.escape(btn.dataset.target)}"]`);
      if (tabBtn) tabBtn.click();
    });
  });

  // Save userNote on blur (debounced)
  const userNoteInput = root.querySelector('[data-user-note-input]');
  const userNoteStatus = root.querySelector('[data-user-note-status]');
  if (userNoteInput && MarginaliaBooksCloud?.enabled) {
    let noteTimer = null;
    userNoteInput.addEventListener('input', () => {
      if (userNoteStatus) userNoteStatus.textContent = '';
      clearTimeout(noteTimer);
      noteTimer = setTimeout(async () => {
        try {
          await MarginaliaBooksCloud.setUserNote({ bookId: id, userNote: userNoteInput.value.trim() });
          if (userNoteStatus) userNoteStatus.textContent = 'Saved';
        } catch (err) {
          logError(err, { context: 'book userNote save', bookId: id });
          if (userNoteStatus) userNoteStatus.textContent = 'Save failed';
        }
      }, 800);
    });
  }

  // ── Notes tab wiring ─────────────────────────────────────────────────────
  // Load saved free note
  const freeNoteTextarea = root.querySelector('#ntFreeNote');
  const freeNoteSaveBtn  = root.querySelector('#ntFreeNoteSave');
  const freeNoteSaveStatus = root.querySelector('#ntFreeNoteSaveStatus');
  if (freeNoteTextarea) {
    NotesStore?.getNote(id).then(saved => {
      if (saved?.content) freeNoteTextarea.value = saved.content;
    }).catch(() => {});
  }
  if (freeNoteSaveBtn && freeNoteTextarea) {
    let freeNoteTimer = null;
    const doSaveFreeNote = async () => {
      try {
        await NotesStore?.saveNote(id, freeNoteTextarea.value);
        if (freeNoteSaveStatus) { freeNoteSaveStatus.textContent = 'Saved'; setTimeout(() => { if (freeNoteSaveStatus) freeNoteSaveStatus.textContent = ''; }, 2000); }
      } catch (err) {
        logError(err, { context: 'book freeNote save', bookId: id });
        if (freeNoteSaveStatus) freeNoteSaveStatus.textContent = 'Failed to save';
      }
    };
    freeNoteSaveBtn.addEventListener('click', doSaveFreeNote);
    freeNoteTextarea.addEventListener('input', () => {
      clearTimeout(freeNoteTimer);
      if (freeNoteSaveStatus) freeNoteSaveStatus.textContent = '';
      freeNoteTimer = setTimeout(doSaveFreeNote, 1200);
    });
  }

  // Template card expand/collapse with prompt-card → write-area flow
  const templateEditor   = root.querySelector('#ntTemplateEditor');
  const editorLabel      = root.querySelector('#ntEditorLabel');
  const promptList       = root.querySelector('#ntPromptList');
  const writeArea        = root.querySelector('#ntWriteArea');
  const activeQuestion   = root.querySelector('#ntActiveQuestion');
  const editorArea       = root.querySelector('#ntEditorArea');
  const editorClose      = root.querySelector('#ntEditorClose');
  const answerSaveBtn    = root.querySelector('#ntAnswerSave');
  const answerBackBtn    = root.querySelector('#ntAnswerBack');
  const templateSaveBtn  = root.querySelector('#ntTemplateSave');
  const templateSaveStatus = root.querySelector('#ntTemplateSaveStatus');
  let activeTemplateId = null;
  // Accumulated Q&A pairs for this template session: [{ q, a }]
  let templateAnswers = [];

  const showPromptList = () => {
    if (promptList) promptList.hidden = false;
    if (writeArea)  writeArea.hidden  = true;
  };

  const showWriteArea = (question) => {
    if (promptList) promptList.hidden = true;
    if (writeArea)  writeArea.hidden  = false;
    if (activeQuestion) activeQuestion.textContent = question;
    if (editorArea) { editorArea.value = ''; editorArea.focus(); }
  };

  const buildPromptList = (prompts) => {
    if (!promptList) return;
    promptList.innerHTML = prompts.map((p, i) => {
      const answered = templateAnswers.some(a => a.q === p);
      return `<button class="nt-prompt-card${answered ? ' is-answered' : ''}" type="button" data-prompt-idx="${i}" data-prompt-text="${esc(p)}">
        ${answered ? '<span class="nt-prompt-check">✓</span>' : ''}
        <span class="nt-prompt-text">${esc(p)}</span>
      </button>`;
    }).join('');

    promptList.querySelectorAll('.nt-prompt-card').forEach(btn => {
      btn.addEventListener('click', () => showWriteArea(btn.dataset.promptText));
    });
  };

  root.querySelectorAll('.nt-card[data-template-id]').forEach(card => {
    card.addEventListener('click', () => {
      const tid = card.dataset.templateId;
      if (!templateEditor) return;

      activeTemplateId = tid;
      templateAnswers = [];

      if (tid === 'custom') {
        if (editorLabel) editorLabel.textContent = 'Custom note';
        buildPromptList([]);
        if (writeArea)  { writeArea.hidden = false; }
        if (promptList) { promptList.hidden = true; }
        if (activeQuestion) activeQuestion.textContent = '';
        if (editorArea) { editorArea.placeholder = 'Write your own note…'; editorArea.value = ''; editorArea.focus(); }
      } else {
        const tmpl = NOTE_TEMPLATES.find(t => t.id === tid);
        if (!tmpl) return;
        if (editorLabel) editorLabel.textContent = tmpl.title;
        buildPromptList(tmpl.prompts);
        showPromptList();
      }

      templateEditor.hidden = false;
      templateEditor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      root.querySelectorAll('.nt-card').forEach(c => c.classList.toggle('is-active', c === card));
    });
  });

  if (answerSaveBtn) {
    answerSaveBtn.addEventListener('click', () => {
      const answer = editorArea?.value.trim();
      const question = activeQuestion?.textContent.trim();
      if (!answer || !question) return;
      // Record answer, mark prompt answered
      templateAnswers = templateAnswers.filter(a => a.q !== question);
      templateAnswers.push({ q: question, a: answer });
      // Rebuild prompt list with checkmarks
      const tmpl = NOTE_TEMPLATES.find(t => t.id === activeTemplateId);
      if (tmpl) buildPromptList(tmpl.prompts);
      showPromptList();
    });
  }

  if (answerBackBtn) {
    answerBackBtn.addEventListener('click', () => showPromptList());
  }

  if (editorClose && templateEditor) {
    editorClose.addEventListener('click', () => {
      templateEditor.hidden = true;
      activeTemplateId = null;
      templateAnswers = [];
      root.querySelectorAll('.nt-card').forEach(c => c.classList.remove('is-active'));
    });
  }

  if (templateSaveBtn) {
    templateSaveBtn.addEventListener('click', async () => {
      const tmpl = NOTE_TEMPLATES.find(t => t.id === activeTemplateId);
      const label = tmpl?.title || 'Custom note';
      // For custom template, grab textarea directly; for structured, use accumulated answers
      let content;
      if (activeTemplateId === 'custom') {
        content = editorArea?.value.trim() || '';
      } else {
        // Also include any unsaved answer currently in the textarea
        const pendingQ = activeQuestion?.textContent.trim();
        const pendingA = editorArea?.value.trim();
        if (pendingQ && pendingA && !templateAnswers.some(a => a.q === pendingQ)) {
          templateAnswers.push({ q: pendingQ, a: pendingA });
        }
        content = templateAnswers.map(({ q, a }) => `${q}\n${a}`).join('\n\n');
      }
      if (!content) return;
      try {
        await NotesStore?.saveNote(id, `[${label}]\n${content}`);
        if (templateSaveStatus) { templateSaveStatus.textContent = 'Saved'; setTimeout(() => { if (templateSaveStatus) templateSaveStatus.textContent = ''; }, 2000); }
        if (freeNoteTextarea) {
          const prev = freeNoteTextarea.value.trim();
          freeNoteTextarea.value = prev ? `${prev}\n\n[${label}]\n${content}` : `[${label}]\n${content}`;
        }
      } catch (err) {
        logError(err, { context: 'book templateNote save', bookId: id });
        if (templateSaveStatus) templateSaveStatus.textContent = 'Failed to save';
      }
    });
  }

  // ── Reading card modal / generation ──────────────────────────────────────
  let currentReadingCardUrl = '';
  let currentReadingCardBlob = null;
  let currentReadingCardName = `${sanitizeFilename(book.title || 'book')}-reading-card.png`;
  let readingCardHero = null;

  if (!publicView) {
    root.querySelector('[data-generate-card]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      readingCardHero = openReadingCardModal(root, bookView.titleZh || bookView.title, readingCardHero);

      try {
        const noteText = await loadReadingCardNotes(id, root, noteContent);
        const allHighlights = dedupeHighlights([...(bookView.highlights || []), ...liveHighlights]);
        const selectedHighlights = selectReadingCardHighlights(allHighlights);
        const aiResult = await fetchReadingCardAI({
          book: bookView,
          highlights: allHighlights,
          notes: noteText,
        });
        const shareUrl = await buildReadingCardShareUrl(id);
        const blob = await generateReadingCardBlob({
          title: bookView.title,
          displayTitle: bookView.titleZh || bookView.title,
          subtitle: bookView.titleZh && bookView.titleZh !== bookView.title ? bookView.title : '',
          author: [bookView.authorZh, bookView.author].filter(Boolean).join(' · ') || bookView.author || '',
          rating: bookView.rating,
          summary: bookView.summary,
          highlights: selectedHighlights.length ? selectedHighlights : ['No highlights captured yet.'],
          takeaway: aiResult.takeaway,
          keywords: mergeReadingCardKeywords(bookView.tags, aiResult.keywords),
          coverUrl: bookView.cover?.image,
          shareUrl,
          readingWindow: formatReadingWindow(bookView),
          edition: bookView.meta?.edition || '',
          publisher: bookView.meta?.publisher || '',
          publishedYear: bookView.year ? String(bookView.year) : '',
          spineColor: bookView.cover?.bg || '#171311',
          textColor: bookView.cover?.text || '#f0e8d8',
        });

        if (currentReadingCardUrl) URL.revokeObjectURL(currentReadingCardUrl);
        currentReadingCardBlob = blob;
        currentReadingCardUrl = URL.createObjectURL(blob);
        currentReadingCardName = `${sanitizeFilename(bookView.title || 'book')}-reading-card.png`;
        showReadingCardResult(root, {
          blobUrl: currentReadingCardUrl,
          bookTitle: bookView.titleZh || bookView.title,
          fileName: currentReadingCardName,
        });
      } catch (err) {
        logError(err, { context: 'reading-card generate', bookId: id });
        showReadingCardError(root, 'Reading card generation failed. Please try again.');
      } finally {
        btn.disabled = false;
      }
    });
  }

  root.querySelector('[data-reading-card-modal]')?.addEventListener('click', async (e) => {
    const closeBtn = e.target.closest('[data-close-reading-card-modal]');
    const shareBtn = e.target.closest('[data-share-card]');
    const downloadBtn = e.target.closest('[data-download-card]');

    if (closeBtn || e.target === e.currentTarget) {
      closeReadingCardModal(root, readingCardHero);
      return;
    }

    if (shareBtn && currentReadingCardBlob) {
      try {
        const file = new File([currentReadingCardBlob], currentReadingCardName, { type: 'image/png' });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: bookView.titleZh || bookView.title });
        } else {
          const a = document.createElement('a');
          a.href = currentReadingCardUrl;
          a.download = currentReadingCardName;
          a.click();
        }
      } catch (err) {
        logError(err, { context: 'reading-card share', bookId: id });
      }
      return;
    }

    if (downloadBtn && currentReadingCardUrl) {
      const a = document.createElement('a');
      a.href = currentReadingCardUrl;
      a.download = currentReadingCardName;
      a.click();
    }
  });

  // Edit book info
  root.querySelector('[data-edit-book-info]')?.addEventListener('click', () => {
    const currentBook = BooksStore.getById(id) || book;
    NewEntry.mountForEdit(currentBook);
  });

  // Delete book (user-created books only)
  const deleteBtn = root.querySelector('[data-delete-book]');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const bookId = deleteBtn.dataset.deleteBook;
      if (!bookId) return;
      if (!confirm(`Remove "${book.title}" from your library? This cannot be undone.`)) return;

      // Remove from Firestore (primary) and IndexedDB (legacy)
      await Promise.allSettled([
        MarginaliaBooksCloud?.deleteBook?.({ bookId }),
        NotesStore?.deleteBook(bookId),
      ]);

      // Re-render shelf and navigate back
      renderSearchSection();
      PanelManager.open('search');
    });
  }
}

/* ── Render ──────────────────────────────────────────────────────────────── */

function renderBook(b, sections) {
  sections = sections || getBookSections(b);

  const inner = `
    <div class="page">
      ${renderMasthead(b)}
      <section class="book-detail-shell">
        <aside class="book-outline" aria-label="Book sections">
          <div class="book-outline-body">
            <div class="book-outline-heading">
              <button
                class="book-outline-toggle"
                type="button"
                aria-expanded="true"
                aria-label="Toggle sections menu"
              >
                <span class="book-outline-toggle-icon" aria-hidden="true"></span>
              </button>
              <span class="book-outline-heading-text">Outline</span>
            </div>
            <nav class="book-outline-nav">
              ${sections.map((s, i) => `
                <button class="book-tab-btn${i === 0 ? ' is-active' : ''}" data-target="${esc(s.id)}" type="button">
                  ${esc(s.label)}
                </button>
              `).join('')}
            </nav>
            ${b.isReadOnly ? '' : renderReadingCardCTA()}
          </div>
        </aside>
        <div class="book-detail-main">
          ${sections.map((s, i) => `
            <div class="book-section${i === 0 ? ' is-active' : ''}" id="${esc(s.id)}">
              ${s.html}
            </div>
          `).join('')}
        </div>
      </section>
      ${b.isReadOnly ? '' : renderReadingCardModal()}
    </div>
  `;

  return renderToolPageShell('book', inner);
}

function getBookSections(b) {
  const sections = b.sections.map((sectionId) => {
    switch (sectionId) {
      case 'overview':
        return { id: sectionId, label: BOOK_SECTION_LABELS[sectionId], html: renderOverview(b) };
      case 'highlights':
        return { id: sectionId, label: BOOK_SECTION_LABELS[sectionId], html: renderHighlights(b) };
      case 'visual-notes':
        return renderVisualNotesSection(b);
      case 'cultural-context':
        return {
          id: sectionId,
          label: BOOK_SECTION_LABELS[sectionId],
          html: b.culturalContext.length ? renderCulturalContext(b) : renderAiPlaceholder('Cultural Context'),
        };
      case 'related-books':
        return {
          id: sectionId,
          label: BOOK_SECTION_LABELS[sectionId],
          html: b.relatedBooks.length ? renderConnections(b) : renderAiPlaceholder('Related Books'),
        };
      case 'notes':
        return renderNotesSection(b);
      case 'actions':
        return renderMountedPanelSection({
          id: sectionId,
          label: BOOK_SECTION_LABELS[sectionId],
          book: b,
          panelId: 'actions',
          fallbackHtml: renderActions(b),
        });
      default:
        return null;
    }
  }).filter(Boolean);

  if (!sections.length) {
    sections.push({ id: 'overview', label: 'Overview', html: renderOverview(b) });
  }
  return sections;
}

/* ── Section renderers ───────────────────────────────────────────────────── */

function renderMasthead(b) {
  if (renderUnifiedPanelHeader) {
    return b.isReadOnly
      ? renderUnifiedPanelHeader('search')
      : renderUnifiedPanelHeader('search', { actionLabel: 'New Note', actionId: 'bookNewNoteBtn' });
  }
  return `
    <header class="book-masthead">
      <a href="#" class="wordmark" data-view="search">Marginalia
        <span class="wordmark-sub">Margins are where thinking happens</span>
      </a>
      <nav class="book-breadcrumb">
        <a data-view="search">Search</a>
        <span class="sep">›</span>
        <span class="current">${esc(b.titleZh || b.title)}</span>
      </nav>
    </header>
  `;
}

function renderReadingCardCTA() {
  return `
    <div class="book-outline-card-section">
      <button class="book-outline-card-btn" type="button" data-generate-card>
        <svg class="book-outline-card-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3.5 13.8 8l4.7 1.8-4.7 1.8L12 16.1l-1.8-4.5L5.5 9.8 10.2 8 12 3.5Z"></path>
          <path d="m18.3 4.8.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z"></path>
          <path d="m18.3 14.8.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z"></path>
        </svg>
        <span class="book-outline-card-btn-label">
          Generate reading card
        </span>
      </button>
    </div>
  `;
}

function renderReadingCardModal() {
  return `
    <div class="reading-card-modal" data-reading-card-modal hidden>
      <div class="reading-card-modal__panel" data-reading-card-modal-panel>
        <button class="reading-card-modal__close" type="button" data-close-reading-card-modal aria-label="Close reading card">×</button>
        <div class="reading-card-modal__body" data-reading-card-modal-body>
          <div class="reading-card-modal__loading" data-reading-card-loading>
            <div class="reading-card-modal__hero" data-reading-card-hero aria-hidden="true"></div>
            <p class="reading-card-modal__status" data-reading-card-status></p>
          </div>
          <div class="reading-card-modal__result" data-reading-card-result hidden></div>
        </div>
      </div>
    </div>
  `;
}


// Build 5 stars, each split into left-half (0.5) and right-half (1.0) hit targets.
function renderStarRow(rating, readOnly) {
  return Array.from({ length: 5 }, (_, i) => {
    const halfVal  = i + 0.5;
    const fullVal  = i + 1;
    const isFull   = rating >= fullVal;
    const isHalf   = !isFull && rating >= halfVal;
    const starPath = 'M8 2l1.8 3.6 4 .6-2.9 2.8.7 4L8 11l-3.6 1.9.7-4L2.1 6.2l4-.6z';

    if (readOnly) {
      const halfClipId = `hc-${i}`;
      if (isHalf) {
        return `<span class="ov-star is-half" aria-hidden="true">
          <svg viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
            <defs><clipPath id="${halfClipId}"><rect x="0" y="0" width="8" height="16"/></clipPath></defs>
            <path d="${starPath}" fill="none"/>
            <path d="${starPath}" fill="currentColor" clip-path="url(#${halfClipId})"/>
          </svg>
        </span>`;
      }
      return `<span class="ov-star${isFull ? ' is-filled' : ''}" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="${isFull ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="${starPath}"/></svg>
      </span>`;
    }

    const halfClipId = `hc-${i}`;
    const starSvg = isHalf
      ? `<svg viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
          <defs><clipPath id="${halfClipId}"><rect x="0" y="0" width="8" height="16"/></clipPath></defs>
          <path d="${starPath}" fill="none"/>
          <path d="${starPath}" fill="currentColor" clip-path="url(#${halfClipId})"/>
        </svg>`
      : `<svg viewBox="0 0 16 16" fill="${isFull ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="${starPath}"/></svg>`;

    return `<span class="ov-star-wrap${isFull ? ' is-filled' : isHalf ? ' is-half' : ''}" data-star-pos="${i}">
      ${starSvg}
      <button class="ov-star-half ov-star-half--left" type="button" data-star="${halfVal}" aria-label="${halfVal} stars"></button>
      <button class="ov-star-half ov-star-half--right" type="button" data-star="${fullVal}" aria-label="${fullVal} stars"></button>
    </span>`;
  }).join('');
}

function renderOverview(b) {
  const isReadOnly = Boolean(b.isReadOnly);
  const cv = b.cover || {};
  const cvStyle = `--cv-bg:${cv.bg || '#14263e'}; --cv-text:${cv.text || '#e8dfc8'}`;
  const hasCoverImage = Boolean(cv.image);

  // ── Meta rows (hollow icon + label + value) ──────────────────────────
  const metaRows = [
    b.meta?.startedAt && b.meta?.finishedAt && {
      icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M5 1v4M11 1v4M2 7h12"/></svg>`,
      k: 'Reading window',
      v: `${formatDate(b.meta.startedAt)} – ${formatDate(b.meta.finishedAt)}`
    },
    b.meta?.edition && {
      icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 2h7l3 3v9H3z"/><path d="M10 2v3h3"/><path d="M5 8h6M5 11h4"/></svg>`,
      k: 'Edition',
      v: esc(b.meta.edition)
    },
    b.year && {
      icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2.5 1.5"/></svg>`,
      k: 'Published',
      v: esc(String(b.year))
    },
    b.meta?.publisher && {
      icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 13V4l6-2 6 2v9"/><path d="M8 2v11"/><path d="M2 9h6M8 9h6"/></svg>`,
      k: 'Publisher',
      v: esc(b.meta.publisher)
    },
  ].filter(Boolean);

  // ── Tags ─────────────────────────────────────────────────────────────
  // Cycling palette — muted, harmonious with the dark theme
  const TAG_COLORS = [
    { bg: 'rgba(168,132,90,0.18)',  color: '#c8a96e' },
    { bg: 'rgba(100,138,120,0.18)', color: '#7db89e' },
    { bg: 'rgba(140,110,160,0.18)', color: '#b08cc8' },
    { bg: 'rgba(90,130,165,0.18)',  color: '#7aaac0' },
    { bg: 'rgba(160,110,100,0.18)', color: '#c8857a' },
    { bg: 'rgba(120,145,90,0.18)',  color: '#96b870' },
  ];
  const tags = Array.isArray(b.tags) ? b.tags : [];
  const tagsHtml = `
    <div class="ov-field">
      <div class="ov-field-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.5l5.5-6.5H14v6.5L7.5 15z"/><circle cx="11" cy="5" r="1" fill="currentColor" stroke="none"/></svg>
      </div>
      <span class="ov-field-label">Tags</span>
      <div class="ov-field-val">
        <div class="ov-tags" data-ov-tags>
          ${tags.map((t, i) => {
            const c = TAG_COLORS[i % TAG_COLORS.length];
            if (isReadOnly) return `<span class="ov-tag ov-tag--static" style="--tag-bg:${c.bg};--tag-color:${c.color}">${esc(t)}</span>`;
            return `<button class="ov-tag" type="button" data-remove-tag="${esc(t)}" style="--tag-bg:${c.bg};--tag-color:${c.color}" title="Click to remove">${esc(t)}</button>`;
          }).join('')}
          ${isReadOnly ? '' : '<button class="ov-tag-add" type="button" data-add-tag aria-label="Add tag">+</button>'}
        </div>
        ${isReadOnly ? '' : `
          <form class="ov-tag-form" data-tag-form hidden>
            <input class="ov-tag-input" type="text" placeholder="Tag name…" maxlength="32" data-tag-input>
            <button class="ov-tag-form-save" type="submit">Add</button>
            <button class="ov-tag-form-cancel" type="button" data-cancel-tag>Cancel</button>
          </form>`}
      </div>
    </div>`;

  // ── Reading progress ──────────────────────────────────────────────────
  const PROGRESS_OPTIONS = [
    { value: 'not-started', label: 'Not started' },
    { value: 'in-progress', label: 'In progress' },
    { value: 'done',        label: 'Done' },
  ];
  const currentProgress = b.meta?.readingProgress || (
    b.status === 'read' ? 'done' : b.status === 'reading' ? 'in-progress' : 'not-started'
  );
  const progressHtml = `
    <div class="ov-field">
      <div class="ov-field-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/></svg>
      </div>
      <span class="ov-field-label">Progress</span>
      <div class="ov-field-val">
        ${isReadOnly
          ? `<span class="ov-progress-dot ov-progress-dot--${esc(currentProgress)}"></span>
             <span>${esc(PROGRESS_OPTIONS.find(o => o.value === currentProgress)?.label || 'Not started')}</span>`
          : `<select class="ov-progress-select" data-progress-select>
               ${PROGRESS_OPTIONS.map(o => `<option value="${o.value}"${o.value === currentProgress ? ' selected' : ''}>${o.label}</option>`).join('')}
             </select>`}
      </div>
    </div>`;

  // ── Rating (standalone block, rendered separately in right column) ───
  const ratingVal = b.rating || 0;
  const ratingDisplay = ratingVal ? `${ratingVal}/5` : '—';
  const ratingBlockHtml = `
    <div class="rating-block">
      <div class="rating-label">Rating</div>
      <div class="rating-num" data-rating-num>${ratingDisplay}<sup>/5</sup></div>
      <div class="ov-rating" data-ov-rating>
        ${renderStarRow(ratingVal, isReadOnly)}
      </div>
      ${!ratingVal && !isReadOnly ? '<div class="rating-note">Tap to rate</div>' : ''}
    </div>`;

  // ── External link ─────────────────────────────────────────────────────
  const extUrl = b.externalLink || '';
  const extHtml = (extUrl || !isReadOnly) ? `
    <div class="ov-field">
      <div class="ov-field-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9"/><path d="M10 2h4v4"/><path d="M14 2 8 8"/></svg>
      </div>
      <span class="ov-field-label">Link</span>
      <div class="ov-field-val" data-ext-link-field>
        ${extUrl
          ? `<a class="ov-link" href="${esc(extUrl)}" target="_blank" rel="noopener">${esc(extUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 38))}${extUrl.length > 42 ? '…' : ''}</a>
             ${isReadOnly ? '' : '<button class="ov-field-edit-btn" type="button" data-edit-ext-link>Edit</button>'}`
          : (isReadOnly ? '' : '<button class="ov-field-add-btn" type="button" data-edit-ext-link>Add link</button>')
        }
        ${isReadOnly ? '' : `
          <form class="ov-douban-form" data-ext-link-form hidden>
            <input class="ov-douban-input" type="url" placeholder="https://…" value="${esc(extUrl)}" data-ext-link-input>
            <button class="ov-tag-form-save" type="submit">Save</button>
            <button class="ov-tag-form-cancel" type="button" data-cancel-ext-link>Cancel</button>
          </form>`}
      </div>
    </div>` : '';

  // ── Douban link ───────────────────────────────────────────────────────
  const doubanUrl = b.meta?.douban || '';
  const doubanHtml = `
    <div class="ov-field">
      <div class="ov-field-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M7 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M13 15l-3.5-3.5"/></svg>
      </div>
      <span class="ov-field-label">Douban</span>
      <div class="ov-field-val" data-douban-field>
        ${doubanUrl
          ? `<a class="ov-link" href="${esc(doubanUrl)}" target="_blank" rel="noopener">${esc(doubanUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 38))}${doubanUrl.length > 42 ? '…' : ''}</a>
             ${isReadOnly ? '' : '<button class="ov-field-edit-btn" type="button" data-edit-douban>Edit</button>'}`
          : (isReadOnly ? '<span class="ov-field-empty">—</span>' : '<button class="ov-field-add-btn" type="button" data-edit-douban>Add link</button>')
        }
        ${isReadOnly ? '' : `
          <form class="ov-douban-form" data-douban-form hidden>
            <input class="ov-douban-input" type="url" placeholder="https://book.douban.com/…" value="${esc(doubanUrl)}" data-douban-input>
            <button class="ov-tag-form-save" type="submit">Save</button>
            <button class="ov-tag-form-cancel" type="button" data-cancel-douban>Cancel</button>
          </form>`}
      </div>
    </div>`;

  // ── Stat cards (count + jump, no content) ────────────────────────────
  const statCards = [
    { id: 'highlights',   label: 'Highlights',   count: (b.highlights || []).length,    target: 'highlights'   },
    { id: 'notes',        label: 'Notes',         count: (b.readingContextBlocks || []).length, target: 'notes' },
    { id: 'connections',  label: 'Connections',   count: getBookGraphConcepts(b.id).length,     target: 'visual-notes' },
    { id: 'actions',      label: 'Actions',        count: (b.actions || []).length,       target: 'actions'      },
  ];

  return `
    <section class="book-overview">
      <div class="book-overview-hero">

        <!-- Col 1: cover -->
        <div class="book-cover-stack">
          <div class="book-cover${hasCoverImage ? ' has-image' : ''}" style="${cvStyle}" role="img" aria-label="${esc(b.titleZh || b.title)} cover">
            ${hasCoverImage
              ? `<img class="book-cover-image" src="${esc(cv.image)}" alt="${esc(b.titleZh || b.title)} cover">`
              : `
                <div><div class="cover-label">${esc(b.author)}</div></div>
                <div>
                  <div class="cover-title-text">
                    ${esc(stripSubtitle(b.title))}
                    ${b.title.includes(':') ? `<em>${esc(b.title.split(':')[1].trim())}</em>` : ''}
                  </div>
                  <div class="cover-deco">${coverArt(cv.art)}</div>
                </div>
                <div class="cover-footer-text">${esc(b.meta?.publisher || '')} · ${b.year || ''}</div>
              `
            }
          </div>
          ${isReadOnly ? '' : `
            <div class="book-cover-tools">
              <button type="button" class="book-cover-upload-btn" data-upload-cover-btn>Upload cover</button>
              <span class="book-cover-upload-status" data-upload-cover-status></span>
              <input type="file" accept="image/*" data-upload-cover-input hidden>
            </div>`}
        </div>

        <!-- Col 2: title + meta fields -->
        <div class="book-overview-main">
          <div class="book-title-big">${formatTitle(b.titleZh || b.title)}</div>
          <div class="book-author">${esc((b.authorZh ? b.authorZh + ' · ' : '') + b.author)}</div>
          ${b.summary ? `<p class="book-overview-summary">${esc(b.summary)}</p>` : ''}

          <div class="ov-fields">
            ${metaRows.map(r => `
              <div class="ov-field ov-field--static">
                <div class="ov-field-icon">${r.icon}</div>
                <span class="ov-field-label">${r.k}</span>
                <div class="ov-field-val">${r.v}</div>
              </div>`).join('')}
            ${progressHtml}
            ${tagsHtml}
            ${extHtml}
            ${doubanHtml}
          </div>

          ${!isReadOnly ? `
            <div class="book-edit-actions">
              <button class="book-edit-info-btn" type="button" data-edit-book-info="${esc(b.id)}">Edit book info</button>
              ${isUserBook(b) ? `<button class="book-delete-btn" type="button" data-delete-book="${esc(b.id)}">Remove book</button>` : ''}
            </div>` : ''}
        </div>

        <!-- Col 3: rating -->
        ${ratingBlockHtml}

      </div>

      <!-- Stat cards — full width below hero (cover left → rating right) -->
      <div class="ov-stats">
        ${statCards.map(s => `
          <button class="ov-stat-card" type="button" data-target="${esc(s.target)}">
            <span class="ov-stat-num">${s.count}</span>
            <span class="ov-stat-label">${esc(s.label)}</span>
          </button>`).join('')}
      </div>

      ${b.relatedBooks?.length ? `
        <div class="ov-related-strip">
          <div class="ov-related-head">
            <span class="ov-related-label book-section-title">Related Books</span>
            <button class="ov-related-see-all" type="button" data-target="related-books">View Details →</button>
          </div>
          <div class="ov-related-scroll">
            ${b.relatedBooks.map(item => {
              const storeMatch = BooksStore.getAll().find(bk => bk.title === item.title || bk.titleZh === item.title)
                || (item.id ? BooksStore.getById(item.id) : null);
              const coverImg = storeMatch?.cover?.image || item.cover || null;
              const cvBg = storeMatch?.cover?.bg || '#14263e';
              const cvText = storeMatch?.cover?.text || '#e8dfc8';
              const bookId = storeMatch?.id || item.id || null;
              return `
                <div class="ov-rel-card${bookId ? ' is-openable' : ''}"${bookId ? ` data-book-id="${esc(String(bookId))}"` : ''}>
                  <div class="ov-rel-cover${coverImg ? ' has-image' : ''}" style="--cv-bg:${esc(cvBg)};--cv-text:${esc(cvText)}">
                    ${coverImg ? `<img src="${esc(coverImg)}" alt="${esc(item.title)}">` : `<span class="ov-rel-cover-title">${esc(item.title)}</span>`}
                  </div>
                  <div class="ov-rel-title">${esc(item.title)}</div>
                  <div class="ov-rel-author">${esc(item.author || '')}</div>
                </div>`;
            }).join('')}
          </div>
        </div>` : ''}

    </section>
  `;
}

function renderIntegration(b) {
  const insight = b.insight || {};
  const stanceCards = [
    { label: 'I Agree',          items: insight.agree   || [] },
    { label: 'I Doubt',          items: insight.doubt   || [] },
    { label: 'I Want to Pursue', items: insight.pursue  || [] },
  ].filter(c => c.items.length);

  return `
    <section class="takeaways-section">
      <div class="takeaways-main">
        <h2 class="book-section-title">My Conclusion</h2>
        <div class="takeaway-body">
          ${insight.oneLiner         ? `<p><em>${esc(insight.oneLiner)}</em></p>` : ''}
          ${insight.answeredQuestion ? `<p><strong>Question answered by this book:</strong>${esc(insight.answeredQuestion)}</p>` : ''}
          ${insight.integration      ? `<p>${esc(insight.integration)}</p>` : ''}
        </div>
        ${stanceCards.length ? `
          <div class="stance-grid">
            ${stanceCards.map(card => `
              <article class="stance-card">
                <div class="stance-label">${esc(card.label)}</div>
                <ul>${card.items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
              </article>
            `).join('')}
          </div>` : ''}
      </div>
      <div class="takeaways-aside">
        <div class="aside-card">
          <div class="aside-card-label">Core Question</div>
          <div class="aside-card-body">${esc(insight.coreQuestion || b.highlights?.[0]?.quote || '')}</div>
        </div>
      </div>
    </section>
  `;
}

function renderHighlights(b) {
  const items = b.highlights || [];
  const isReadOnly = Boolean(b.isReadOnly);
  return `
    <section class="highlights-section">
      <div class="section-head">
        <h2 class="book-section-title">Highlights</h2>
        ${isReadOnly ? '' : `
          <div class="sh-actions">
            <button class="hl-add-btn" type="button" id="hlAddBtn">+ Add highlight</button>
            <button class="hl-add-btn" type="button" id="hlKindleBtn">Import from Kindle</button>
          </div>`}
      </div>
      ${items.length ? `
        <ul class="highlight-list" id="hlList">
          ${items.map((h, i) => renderHighlightItem(h, i, isReadOnly)).join('')}
        </ul>
      ` : `<div class="ai-panel-placeholder"><span>${isReadOnly ? 'No highlights were shared for this book.' : 'No highlights yet — import them from Kindle or add them manually above.'}</span></div>`}
      ${isReadOnly ? '' : `
        <div class="hl-kindle-zone" id="hlKindleZone" hidden data-book-id="${esc(b.id)}"></div>
        <form class="hl-form" id="hlForm" hidden>
          <div class="hl-form-row">
            <label class="hl-form-label">Quote <span class="hl-form-req">*</span></label>
            <textarea class="hl-form-textarea" id="hlFormQuote" rows="3" placeholder="Paste the passage here…"></textarea>
          </div>
          <div class="hl-form-meta-row">
            <div class="hl-form-col">
              <label class="hl-form-label">Page</label>
              <input class="hl-form-input" id="hlFormPage" type="number" min="1" placeholder="—">
            </div>
            <div class="hl-form-col">
              <label class="hl-form-label">Kind</label>
              <select class="hl-form-select" id="hlFormKind">
                <option value="">—</option>
                <option value="concept">Concept</option>
                <option value="argument">Argument</option>
                <option value="critique">Critique</option>
                <option value="action">Action trigger</option>
              </select>
            </div>
            <div class="hl-form-col hl-form-col--wide">
              <label class="hl-form-label">Chapter / section</label>
              <input class="hl-form-input" id="hlFormChapter" type="text" placeholder="—">
            </div>
          </div>
          <div class="hl-form-row">
            <label class="hl-form-label">Note (optional)</label>
            <textarea class="hl-form-textarea" id="hlFormNote" rows="2" placeholder="Your own annotation…"></textarea>
          </div>
          <div class="hl-form-actions">
            <button class="hl-form-save" type="submit">Save</button>
            <button class="hl-form-cancel" type="button" id="hlFormCancel">Cancel</button>
          </div>
        </form>`}
    </section>
  `;
}

function renderHighlightItem(h, i, readOnly = false) {
  const isUser = Boolean(h.bookId); // user-created highlights have bookId from store
  return `
    <li class="hl-item${isUser ? ' hl-item--user' : ''}" data-hl-id="${esc(String(h.id))}">
      <div class="hl-index">${String(i + 1).padStart(2, '0')}</div>
      <div class="hl-body">
        <div class="hl-quote-row">
          <p class="hl-quote">${esc(h.quote)}</p>
          ${h.annotation ? `
            <button class="hl-annotation-toggle" type="button" aria-expanded="true" aria-label="Collapse culture note">
              <span class="tog-label">Culture note</span><span class="tog-icon">−</span>
            </button>` : ''}
        </div>
        ${isUser && !readOnly ? `<button class="hl-delete-btn" type="button" data-hl-delete="${esc(String(h.id))}" aria-label="Delete highlight">×</button>` : ''}
        ${h.annotation ? `
          <div class="hl-annotation" data-hl-annotation>
            <p>${esc(h.annotation)}</p>
          </div>` : ''}
      </div>
    </li>`;
}

function renderCulturalContext(b) {
  return `
    <section class="cultural-bg">
      <h2 class="section-title book-section-title">Cultural Context</h2>
      <div class="cultural-grid">
        ${b.culturalContext.map(c => `
          <div class="cultural-item">
            <div class="ci-tag">${esc(c.tag)}</div>
            <div class="ci-term"${c.conceptId ? ` data-open-concept-id="${esc(c.conceptId)}" role="button" tabindex="0"` : ''}>${esc(c.term)}</div>
            <div class="ci-body">${esc(c.body)}</div>
            ${c.ref ? `<span class="ci-ref">— ${esc(c.ref)}</span>` : ''}
          </div>`).join('')}
      </div>
    </section>
  `;
}

function renderRelatedConcepts(b) {
  const items = getBookGraphConcepts(b.id);
  return `
    <section class="connections-section">
      <h2 class="book-section-title">Related Concepts</h2>
      <div class="related-concept-grid">
        ${items.map(({ concept, link, context }) => {
          const statusMeta = MarginaliaGraph.getLinkStatusMeta(link.status);
          const relationMeta = MarginaliaGraph.getRelationMeta(link.relationType);
          return `
            <article class="related-concept-card${link.status === 'suggested' ? ' is-suggested' : ''}" data-open-concept-id="${esc(concept.id)}" role="button" tabindex="0">
              <div class="related-concept-meta">
                <span>${esc(statusMeta.label)}</span>
                <span>·</span>
                <span style="color:${relationMeta.color}">${esc(relationMeta.label)}</span>
              </div>
              <h3>${esc(concept.name)}</h3>
              <p>${esc(link.readerUnderstanding || concept.description || '')}</p>
              <div class="related-concept-footer">
                ${context ? `<span>${esc(context.label)}</span>` : '<span>Concept</span>'}
                <span>Open</span>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderMindmap(b) {
  const mm = b.mindmap || {};
  const timeline     = mm.timeline     || [];
  const revolutions  = mm.revolutions  || [];

  const tabs = [
    timeline.length    ? { id: 'timeline',    label: 'Timeline' }    : null,
    revolutions.length ? { id: 'revolutions', label: 'Revolutions' } : null,
  ].filter(Boolean);

  const firstTabId = tabs[0]?.id || 'timeline';

  return `
    <section class="mindmap-section">
      <div class="section-head section-head--visual-notes">
        <h2 class="mindmap-title book-section-title">Knowledge structure</h2>
        <div class="sh-actions">
          <label class="hl-add-btn vn-import-btn" title="Import visual notes">
            Import visual notes
            <input type="file" accept=".html,text/html" class="vn-file-input" hidden multiple>
          </label>
        </div>
      </div>

      <div class="mm-top-tabs">
        ${tabs.map(t => `
          <button class="mm-top-tab${t.id === firstTabId ? ' is-active' : ''}" type="button" data-mm-tab="${esc(t.id)}">${esc(t.label)}</button>
        `).join('')}
      </div>

      <div class="mm-tab-shell">
        <div class="mm-tab-pane${firstTabId === 'timeline' ? ' is-active' : ''}" data-mm-pane="timeline">
          ${timeline.map(group => `
            <article class="mm-timeline-group">
              <div class="mm-timeline-era">${esc(group.era || '')}</div>
              <div class="mm-timeline-list">
                ${(group.items || []).map(item => `
                  <div class="mm-timeline-item">
                    <div class="mm-timeline-year">${esc(item.year || '')}</div>
                    <div class="mm-timeline-body">
                      <div class="mm-timeline-title">${esc(item.title || '')}</div>
                      ${(item.tags || []).length ? `
                        <div class="mm-pill-row">
                          ${item.tags.map(tag => `<span class="mm-pill">${esc(tag)}</span>`).join('')}
                        </div>` : ''}
                    </div>
                  </div>`).join('')}
              </div>
            </article>`).join('')}
        </div>

        <div class="mm-tab-pane${firstTabId === 'revolutions' ? ' is-active' : ''}" data-mm-pane="revolutions">
          <div class="mm-rev-tabs">
            ${revolutions.map((r, i) => `
              <button class="mm-rev-tab${i === 0 ? ' is-active' : ''}" type="button" data-mm-rev-tab="${esc(r.id || `r${i}`)}">
                ${esc(r.title || '')}
              </button>`).join('')}
          </div>
          <div class="mm-rev-panels">
            ${revolutions.map((r, i) => `
              <article class="mm-rev-card${i === 0 ? ' is-active' : ''}" data-mm-rev-pane="${esc(r.id || `r${i}`)}">
                <div class="mm-rev-head">
                  <h3>${esc(r.title || '')}</h3>
                  ${r.period ? `<div class="mm-rev-period">${esc(r.period)}</div>` : ''}
                  <p>${esc(r.thesis || '')}</p>
                </div>
                <div class="mm-rev-branches">
                  ${(r.branches || []).map(br => `
                    <div class="mm-branch">
                      <div class="mm-branch-label">${esc(br.label || '')}</div>
                      <div class="mm-pill-row">
                        ${(br.items || []).map(it => `<span class="mm-pill">${esc(it)}</span>`).join('')}
                      </div>
                    </div>`).join('')}
                </div>
                <ul class="mm-points">
                  ${(r.points || []).map(p => `<li>${esc(p)}</li>`).join('')}
                </ul>
                <div class="mm-chapters">
                  ${(r.chapters || []).map(ch => `<span class="mm-chapter">${esc(ch)}</span>`).join('')}
                </div>
              </article>`).join('')}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderConnections(b) {
  return `
    <section class="connections-section">
      <h2 class="book-section-title">Related Books</h2>
      <ul class="connection-list">
        ${b.relatedBooks.map(item => {
          const storeMatch = BooksStore.getAll().find(bk => bk.title === item.title || bk.titleZh === item.title)
            || (item.id ? BooksStore.getById(item.id) : null);
          const canOpen = Boolean(storeMatch);
          const coverImg = storeMatch?.cover?.image || item.cover || null;
          const cvBg = storeMatch?.cover?.bg || '#14263e';
          const cvText = storeMatch?.cover?.text || '#e8dfc8';
          const bookId = storeMatch?.id || item.id || null;
          return `
            <li class="connection-item">
              <div class="connection-main">
                <div class="connection-title">${esc(item.title || '')}</div>
                <div class="connection-author">${esc(item.author || '')}</div>
                <p class="connection-relation">${esc(item.relation || '')}</p>
                <div class="connection-footer">
                  ${item.type ? `<span class="connection-type">${esc(item.type)}</span>` : ''}
                  ${canOpen && bookId
                    ? `<button class="connection-action connection-action--open" type="button" data-book-id="${esc(String(bookId))}">Open book →</button>`
                    : `<button class="connection-action connection-action--add" type="button" data-add-book-title="${esc(item.title)}" data-add-book-author="${esc(item.author || '')}">+ Add to shelf</button>`}
                </div>
              </div>
              <div class="connection-cover${coverImg ? ' has-image' : ''}" style="--cv-bg:${esc(cvBg)};--cv-text:${esc(cvText)}">
                ${coverImg ? `<img src="${esc(coverImg)}" alt="${esc(item.title)}">` : `<span class="connection-cover-title">${esc(item.title)}</span>`}
              </div>
            </li>`;
        }).join('')}
      </ul>
    </section>
  `;
}

function renderActions(b) {
  const actions = b.actions || [];
  return `
    <section class="actions-section">
      <h2 class="book-section-title">Actions</h2>
      ${actions.length ? `
        <ul class="action-list">
          ${actions.map(a => `
            <li class="action-item${a.status === 'done' ? ' done' : ''}" data-id="${esc(a.id)}">
              <div class="action-check"></div>
              <div class="action-text">${esc(a.text)}</div>
              <span class="action-tag">${esc(normalizeActionTag(a.tag) || statusLabel(a.status))}</span>
            </li>`).join('')}
        </ul>
      ` : renderAiPlaceholder('Actions')}
    </section>
  `;
}

function renderAiPlaceholder(label) {
  return `<div class="ai-panel-placeholder"><span>No ${esc(label)} yet — use the Generate button above to create one with AI.</span></div>`;
}

const NOTE_TEMPLATES = [
  {
    id: 'reading-context',
    icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 4h14M3 8h10M3 12h7"/><circle cx="15" cy="14" r="3"/><path d="M15 12.5v1.5l1 1"/></svg>`,
    title: 'Reading Context',
    desc: 'Capture when, where, and in what state of mind you picked up this book.',
    prompts: ['When and where did you read this?', 'What was happening in your life at the time?', 'What drew you to this book?'],
    placeholder: `When and where did you read this?\n\nWhat was happening in your life at the time?\n\nWhat drew you to this book?`,
  },
  {
    id: 'core-takeaways',
    icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M10 3c0 0-5 3.5-5 8a5 5 0 0010 0c0-4.5-5-8-5-8z"/><path d="M10 11v3M8.5 15.5h3"/></svg>`,
    title: 'Core Takeaways',
    desc: 'The most important ideas and how they changed your thinking.',
    prompts: ['What is the single most important idea in this book?', 'What assumption did it overturn for you?', 'What insight do you keep returning to?'],
    placeholder: `What is the single most important idea in this book?\n\nWhat assumption did it overturn for you?\n\nWhat insight do you keep returning to?`,
  },
  {
    id: 'connections',
    icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="5" cy="10" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="15" cy="15" r="2"/><path d="M7 10h3l3-3.5M10 10l3 3.5"/></svg>`,
    title: 'Connections & Associations',
    desc: 'Links to other books, ideas, or personal experiences this book resonates with.',
    prompts: ['What other books or ideas does this connect to?', 'What personal experience does it mirror?', 'What real-world pattern does it illuminate?'],
    placeholder: `What other books or ideas does this connect to?\n\nWhat personal experience does it mirror?\n\nWhat real-world pattern does it illuminate?`,
  },
  {
    id: 'actions',
    icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3" y="4" width="14" height="13" rx="1.5"/><path d="M7 9l2 2 4-4"/><path d="M7 14h6"/></svg>`,
    title: 'Actions & Applications',
    desc: 'How you plan to apply what you learned — concrete next steps.',
    prompts: ['What action can you take this week?', 'How will this change how you think or choose?', 'What would you tell your future self about this book?'],
    placeholder: `What action can you take this week?\n\nHow will this change how you think or choose?\n\nWhat would you tell your future self about this book?`,
  },
];

function renderNotesSection(b) {
  if (b.isReadOnly) {
    const noteContent = String(b.noteContent || '').trim();
    return {
      id: 'notes',
      label: BOOK_SECTION_LABELS.notes,
      html: `
        <section class="notes-section notes-section--readonly">
          <div class="nt-header">
            <h2 class="book-section-title">My Notes</h2>
          </div>
          ${noteContent
            ? `<div class="notes-readonly-body">${noteContent.split(/\n+/).map((line) => `<p>${esc(line)}</p>`).join('')}</div>`
            : '<div class="ai-panel-placeholder"><span>No notes were shared for this book.</span></div>'}
        </section>`,
    };
  }

  const templateCards = NOTE_TEMPLATES.map(t => `
    <button class="nt-card" type="button" data-template-id="${esc(t.id)}">
      <div class="nt-card-icon">${t.icon}</div>
      <div class="nt-card-title">${esc(t.title)}</div>
      <p class="nt-card-desc">${esc(t.desc)}</p>
      <span class="nt-card-cta">Use template</span>
    </button>`).join('');

  const customCard = `
    <button class="nt-card nt-card--custom" type="button" data-template-id="custom">
      <div class="nt-card-plus">+</div>
      <div class="nt-card-title">Custom template</div>
      <p class="nt-card-desc">Create your own note template</p>
    </button>`;

  // Template editor — prompt cards are vertical bordered blocks, clickable to activate.
  // Active prompt shows question italic above the input area; user writes answer then saves
  // that Q&A before picking the next prompt. Also a global "Save note" button.
  const templateEditor = `
    <div class="nt-template-editor" id="ntTemplateEditor" hidden>
      <div class="nt-editor-head">
        <span class="nt-editor-label" id="ntEditorLabel"></span>
        <button class="nt-editor-close" type="button" id="ntEditorClose" aria-label="Close template">×</button>
      </div>
      <div class="nt-editor-body">
        <div class="nt-prompt-list" id="ntPromptList"></div>
        <div class="nt-write-area" id="ntWriteArea" hidden>
          <p class="nt-active-question" id="ntActiveQuestion"></p>
          <textarea class="nt-editor-area" id="ntEditorArea" rows="5" placeholder="Write your answer here…"></textarea>
          <div class="nt-write-actions">
            <button class="nt-answer-save" type="button" id="ntAnswerSave">Save this answer</button>
            <button class="nt-answer-back" type="button" id="ntAnswerBack">← Back to prompts</button>
          </div>
        </div>
      </div>
      <div class="nt-editor-footer">
        <button class="nt-save-btn" type="button" id="ntTemplateSave">Save all notes</button>
        <span class="nt-save-status" id="ntTemplateSaveStatus"></span>
      </div>
    </div>`;

  // Free note area — always visible at the bottom
  const freeNoteArea = `
    <div class="nt-free-section">
      <div class="nt-free-label">Free notes</div>
      <div class="nt-free-area">
        <textarea
          class="nt-free-textarea"
          id="ntFreeNote"
          placeholder="Start writing your notes…"
          rows="6"
          data-book-id="${esc(b.id)}"
        ></textarea>
        <div class="nt-free-footer">
          <button class="nt-save-btn" type="button" id="ntFreeNoteSave">Save</button>
          <span class="nt-save-status" id="ntFreeNoteSaveStatus"></span>
        </div>
      </div>
    </div>`;

  const html = `
    <section class="notes-section">
      <div class="nt-header">
        <h2 class="book-section-title">My Notes</h2>
      </div>

      <div class="nt-templates-grid">
        ${templateCards}
        ${customCard}
      </div>

      ${templateEditor}
      ${freeNoteArea}
    </section>`;

  return { id: 'notes', label: BOOK_SECTION_LABELS.notes, html };
}

function renderVisualNotesSection(b) {
  const visualHtml = b.mindmap
    ? renderMindmap(b)
    : '';

  return renderMountedPanelSection({
    id: 'visual-notes',
    label: BOOK_SECTION_LABELS['visual-notes'],
    book: b,
    panelId: 'visual-notes',
    leadingHtml: visualHtml,
    fallbackHtml: b.mindmap ? '' : renderAiPlaceholder('Visual Notes'),
  });
}

function renderMountedPanelSection({ id, label, book, panelId, leadingHtml = '', fallbackHtml = '' }) {
  const panel = PanelRegistry?.get(panelId) || null;

  if (!panel?.render) {
    return {
      id,
      label,
      html: `${leadingHtml}${fallbackHtml}`,
    };
  }

  const slotMarkup = `<div data-book-panel-slot="${esc(panelId)}"></div>`;
  return {
    id,
    label,
    html: `${leadingHtml}${slotMarkup}`,
    mountFn: (liveEl) => {
      const slot = liveEl.querySelector(`[data-book-panel-slot="${CSS.escape(panelId)}"]`);
      if (slot) panel.render(book, slot);
    },
  };
}

async function fetchPublicBookContext(slug, bookId) {
  const db = MarginaliaAuth?.db;
  if (!db || !slug || !bookId) return null;

  const userSnap = await getDocs(query(collection(db, 'users'), where('settings.slug', '==', slug), limit(1)));
  if (userSnap.empty) return null;

  const userDoc = userSnap.docs[0];
  const userData = userDoc.data() || {};
  if (userData.settings?.profilePublic === false) return null;

  const workspaceId = ENV.WORKSPACE_ID || 'default';
  const bookRef = doc(db, 'workspaces', workspaceId, 'users', userDoc.id, 'books', bookId);
  const bookSnap = await getDoc(bookRef);
  if (!bookSnap.exists()) return null;

  const bookData = bookSnap.data() || {};
  const [noteSnap, highlightSnap] = await Promise.all([
    getDoc(doc(bookRef, 'notes', 'main')).catch(() => null),
    getDocs(query(
      collection(db, 'workspaces', workspaceId, 'users', userDoc.id, 'highlights'),
      where('bookId', '==', bookId),
      limit(24),
    )).catch(() => null),
  ]);

  return {
    book: {
      id: bookId,
      ...bookData,
      title: bookData.title || bookData.meta?.title || bookId,
      author: bookData.author || bookData.meta?.author || '',
      highlights: [],
    },
    highlights: (highlightSnap?.docs || []).map((doc) => ({ id: doc.id, ...doc.data() })),
    noteContent: String(noteSnap?.data()?.content || ''),
  };
}

function renderMissingBookState(message) {
  const root = document.getElementById('panel-book');
  if (!root) return;
  root.innerHTML = renderToolPageShell('book', `
    <div class="page">
      <section class="book-missing-state">
        <h2>Book unavailable</h2>
        <p>${esc(message)}</p>
      </section>
    </div>
  `);
}

function dedupeHighlights(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item?.quote || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadReadingCardNotes(bookId, root, fallbackNote = '') {
  const noteEditor = root.querySelector('#ntFreeNote');
  if (noteEditor?.value?.trim()) return htmlToPlainText(noteEditor.value.trim());

  if (fallbackNote?.trim()) return htmlToPlainText(fallbackNote);

  await NotesStore?.ready?.();
  const stored = await NotesStore?.getNote(bookId);
  return htmlToPlainText(stored?.content || '');
}

function selectReadingCardHighlights(highlights) {
  return highlights
    .slice()
    .sort((a, b) => {
      const annotationDelta = Number(Boolean(b.annotation)) - Number(Boolean(a.annotation));
      if (annotationDelta) return annotationDelta;
      return (b.quote?.length || 0) - (a.quote?.length || 0);
    })
    .slice(0, 3)
    .map((item) => truncate(String(item.quote || '').trim(), 140))
    .filter(Boolean);
}

function mergeReadingCardKeywords(tags = [], aiKeywords = []) {
  const merged = [...(Array.isArray(tags) ? tags : []), ...(Array.isArray(aiKeywords) ? aiKeywords : [])]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return Array.from(new Set(merged)).slice(0, 6);
}

async function buildReadingCardShareUrl(bookId) {
  const fallback = window.location.href;
  const db = MarginaliaAuth?.db;
  const uid = MarginaliaAuth?.user?.uid;
  if (!db || !uid || !bookId) return fallback;

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const slug = String(snap.data()?.settings?.slug || '').trim().toLowerCase();
    if (!slug) return fallback;
    return `${window.location.origin}${window.location.pathname}#/p/${slug}/book/${encodeURIComponent(bookId)}`;
  } catch {
    return fallback;
  }
}

function openReadingCardModal(root, title, heroBook = null) {
  const modal = root.querySelector('[data-reading-card-modal]');
  const loading = root.querySelector('[data-reading-card-loading]');
  const result = root.querySelector('[data-reading-card-result]');
  const status = root.querySelector('[data-reading-card-status]');
  const heroMount = root.querySelector('[data-reading-card-hero]');
  if (!modal || !loading || !result || !status || !heroMount) return heroBook;

  if (!heroBook) {
    heroBook = new HeroBook({ height: 220 });
    heroBook.mount(heroMount);
  }

  modal.hidden = false;
  loading.hidden = false;
  result.hidden = true;
  result.innerHTML = '';
  status.textContent = `Generating your custom reading note of ${title}`;
  heroBook.open();
  document.body.classList.add('reading-card-modal-open');
  return heroBook;
}

function closeReadingCardModal(root, heroBook = null) {
  const modal = root.querySelector('[data-reading-card-modal]');
  if (!modal) return;
  modal.hidden = true;
  heroBook?.close?.();
  document.body.classList.remove('reading-card-modal-open');
}

function showReadingCardResult(root, { blobUrl, bookTitle, fileName }) {
  const loading = root.querySelector('[data-reading-card-loading]');
  const result = root.querySelector('[data-reading-card-result]');
  if (!loading || !result) return;

  loading.hidden = true;
  result.hidden = false;
  result.innerHTML = `
    <div class="reading-card-modal__preview-wrap">
      <img src="${blobUrl}" alt="Reading card for ${esc(bookTitle)}" class="reading-card-modal__preview">
    </div>
    <div class="reading-card-modal__actions">
      <button type="button" class="reading-card-modal__action reading-card-modal__action--primary" data-share-card data-file-name="${esc(fileName)}">Share</button>
      <button type="button" class="reading-card-modal__action" data-download-card data-file-name="${esc(fileName)}">Download</button>
    </div>
  `;
}

function showReadingCardError(root, message) {
  const loading = root.querySelector('[data-reading-card-loading]');
  const result = root.querySelector('[data-reading-card-result]');
  if (!loading || !result) return;

  loading.hidden = true;
  result.hidden = false;
  result.innerHTML = `<div class="reading-card-modal__error">${esc(message)}</div>`;
}

function formatReadingWindow(book) {
  const start = book?.meta?.startedAt ? formatDate(book.meta.startedAt) : '';
  const end = book?.meta?.finishedAt ? formatDate(book.meta.finishedAt) : '';
  if (start && end) return `${start} - ${end}`;
  return start || end || '';
}

function sanitizeFilename(value) {
  return String(value || 'book')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'book';
}

function htmlToPlainText(content) {
  const raw = String(content || '').trim();
  if (!raw) return '';
  const div = document.createElement('div');
  div.innerHTML = raw.replace(/\n/g, '<br>');
  return div.textContent?.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() || '';
}

/* ── Utilities ───────────────────────────────────────────────────────────── */

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"]/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

// User-created books have ids generated by new-entry.js (prefix 'book-')
function isUserBook(b) {
  return String(b.id || '').startsWith('book-');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function daysBetween(a, b) {
  return Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000));
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function stripSubtitle(t) {
  return t.includes(':') ? t.split(':')[0].trim() : t;
}

function formatTitle(t) {
  if (!t) return '';
  if (t.length <= 2) return esc(t);
  if (/[一-龥]/.test(t)) {
    const split = Math.floor(t.length / 2);
    return `${esc(t.slice(0, split))}<em>${esc(t.slice(split))}</em>`;
  }
  return esc(t);
}

function statusLabel(s) {
  return { open: 'Pending', done: 'Completed', snoozed: 'Snoozed', archived: 'Archived', doing: 'In Progress', todo: 'Pending' }[s] || s;
}

function normalizeActionTag(tag) {
  if (!tag) return '';
  return { '已完成': 'Completed', '待执行': 'Pending', '进行中': 'In Progress' }[tag] || tag;
}

function normalizeHighlightKind(kind) {
  return { concept: 'Concept', argument: 'Argument', critique: 'Critique', action: 'Action trigger' }[kind] || kind;
}

function getBookGraphConcepts(bookId) {
  if (!MarginaliaGraph?.getBookRelatedConcepts) return [];
  return MarginaliaGraph.getBookRelatedConcepts(bookId);
}

function coverArt(id) {
  if (id === 'sapiens') {
    return `
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
        <circle cx="36" cy="36" r="34" stroke="rgba(232,223,200,0.18)" stroke-width="1"/>
        <circle cx="36" cy="36" r="22" stroke="rgba(232,223,200,0.12)" stroke-width="1"/>
        <line x1="36" y1="2" x2="36" y2="70" stroke="rgba(232,223,200,0.2)" stroke-width="0.5"/>
        <line x1="2" y1="36" x2="70" y2="36" stroke="rgba(232,223,200,0.2)" stroke-width="0.5"/>
        <circle cx="36" cy="19" r="4" fill="rgba(232,223,200,0.55)"/>
        <path d="M36 24 L36 44 M28 30 L36 34 L44 30 M36 44 L30 56 M36 44 L42 56"
          stroke="rgba(232,223,200,0.55)" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`;
  }
  return '';
}

export { initBook, enterBook };
export function enterPanel_book(params = {}) { enterBook(params); }
