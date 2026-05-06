// Entry point for Vite. Imports all non-CDN, non-module scripts in their
// original load order. CDN scripts (Firebase compat, amCharts) and the two
// existing ES module scripts (room-scene.js, hero-glb.js) stay in index.html.

import { APP_VERSION } from './core/version.ts';
import { M } from './core/namespace.ts';
import { initAnalytics } from './services/analytics.ts';
import { setLanguage } from './core/i18n.ts';
console.debug('[marginalia] version', APP_VERSION);
initAnalytics();

// M is the single namespace root. All migrated globals are registered on it
// for legacy bridge code that still reads via M.*.

// 1. Schema + type system
import { BOOK_TYPES, BookTypes } from './data/schema/book-types.js';
import { PanelRegistry } from './book/panels/registry.js';
import { AIFeatureRegistry } from './ai/features/registry.js';
M.data.BOOK_TYPES = BOOK_TYPES;
M.data.BookTypes = BookTypes;
M.ui.PanelRegistry = PanelRegistry;
M.ai.AIFeatureRegistry = AIFeatureRegistry;

// 2. Firebase layer
import { MARGINALIA_FIREBASE } from './firebase/config.js';
import { MarginaliaAuth } from './firebase/auth.js';
import { MarginaliaBooksCloud, MarginaliaStorage } from './firebase/db.js';

// 3. State stores
import { NotesStore } from './store/notes-store.js';
import { BooksStore } from './store/books-store.ts';
import { HighlightsStore } from './store/highlights-store.ts';
import { EntitlementsStore } from './store/entitlements-store.ts';
import { AiResultsStore } from './store/ai-results-store.ts';
import { ActionsStore } from './store/actions-store.ts';
import { mountActionNotifications, unmountActionNotifications } from './components/action-notifications/action-notifications.ts';
import { initReadingSession, teardownReadingSession } from './components/reading-session/reading-session.ts';
import { mountFocusWidget } from './components/reading-session/focus-widget.ts';
import './components/reading-session/reading-session.css';
import './components/action-notifications/action-notifications.css';
M.store.NotesStore = NotesStore;
M.store.BooksStore = BooksStore;
M.store.HighlightsStore = HighlightsStore;
M.store.EntitlementsStore = EntitlementsStore;
M.store.AiResultsStore = AiResultsStore;
M.store.ActionsStore = ActionsStore;

// 4. Core app utilities
import { MarginaliaGraph } from './core/graph-data.js';
M.store.MarginaliaGraph = MarginaliaGraph;
import { PanelManager } from './core/panel-manager.js';
import { App, registerPreloader, renderPrimaryHeader, renderUnifiedPanelHeader, renderToolPageShell } from './core/app.js';
import { openConceptDrawer, closeConceptDrawer } from './core/concept-ui.js';
M.ui.PanelManager = PanelManager;
M.ui.closeConceptDrawer = closeConceptDrawer;

// 4b. API adapters
import { KindleImport } from './api/kindle-import.js';
M.ui.KindleImport = KindleImport;

// 5. Shared components
import { SpineCard } from './components/spine-card.js';
import { NewEntry } from './new-entry/new-entry.js';
M.ui.SpineCard = SpineCard;
M.ui.NewEntry = NewEntry;

// 6a. AI layer
import { MarginaliaAI } from './services/ai-gateway.ts';
import { AIGenerateUI } from './ai/client/generate-ui.ts';
import './ai/features/prompts/mindmap-gen.js';
import './ai/features/prompts/concept-cards.js';
import './ai/features/prompts/argument-breakdown.js';
import './ai/features/prompts/timeline-gen.js';
import './ai/features/prompts/action-suggest.js';
M.ai.MarginaliaAI = MarginaliaAI;
M.ai.AIGenerateUI = AIGenerateUI;

// 6b. Panel scripts
import './book/panels/notes.js';
import './book/panels/claude-import.js';
import './book/panels/actions.js';
import './book/panels/actions.css';

// 6. Views (three-room/room-scene.js and preloader/hero-glb.js stay in index.html as type="module")
// window.__heroGLBReadyPromise is set by hero-glb.js (HTML script tag, not bundled — see ADR 0002)
import { enterPreloader } from './preloader/preloader.js';
M.views.enterPreloader = enterPreloader;
registerPreloader(enterPreloader);
import { initShelf, enterShelf, enterPanel_shelf, renderShelfSection } from './shelf/shelf.js';
import { initLibrary, enterLibrary, enterPanel_library } from './library-2d/library-2d.js';
import { initRoom, enterRoom, renderRoomTopTabs } from './three-room/three-room-view.js';
import { initBooklist, enterBooklist, enterPanel_booklist } from './booklist/booklist.js';
import { initBook, enterBook, enterPanel_book } from './book/book.js';
import { initMap, enterMap, enterPanel_map } from './map/map.js';
import { initWeb, enterWeb, enterPanel_web } from './web/web.js';
M.views.initShelf = initShelf; M.views.enterShelf = enterShelf; M.views.enterPanel_shelf = enterPanel_shelf;
M.views.initLibrary = initLibrary; M.views.enterLibrary = enterLibrary; M.views.enterPanel_library = enterPanel_library;
M.views.initRoom = initRoom; M.views.enterRoom = enterRoom; M.views.renderRoomTopTabs = renderRoomTopTabs;
M.views.initBooklist = initBooklist; M.views.enterBooklist = enterBooklist; M.views.enterPanel_booklist = enterPanel_booklist;
M.views.initBook = initBook; M.views.enterBook = enterBook; M.views.enterPanel_book = enterPanel_book;
M.views.initMap = initMap; M.views.enterMap = enterMap; M.views.enterPanel_map = enterPanel_map;
M.views.initWeb = initWeb; M.views.enterWeb = enterWeb; M.views.enterPanel_web = enterPanel_web;
M.ui.renderShelfSection = renderShelfSection;

// Wire BooksStore to Firebase auth state.
// When a user signs in, start the Firestore onSnapshot listener.
// When signed out, detach and fall back to seed demo data.
window.addEventListener('marginalia:auth-changed', (event) => {
  const { user, enabled } = event.detail || {};
  if (!enabled) return;
  const db = MarginaliaAuth.db;
  if (user?.uid && db) {
    BooksStore.initWithUser(user.uid, db);
    HighlightsStore.initWithUser(user.uid, db);
    AiResultsStore.init(user.uid, db);
    ActionsStore.initWithUser(user.uid, db);
    mountActionNotifications(user.uid, db);
    initReadingSession(user.uid, db);
    // Load user's language preference and apply immediately.
    db.doc(`users/${user.uid}`).get().then((snap) => {
      const lang = snap.data()?.settings?.language;
      if (lang) setLanguage(lang);
    }).catch(() => {});
  } else {
    BooksStore.teardown();
    HighlightsStore.teardown();
    AiResultsStore.teardown();
    ActionsStore.teardown();
    unmountActionNotifications();
    teardownReadingSession();
    setLanguage('en');
  }
});

// Mount global focus widget once on DOM ready
document.addEventListener('DOMContentLoaded', () => mountFocusWidget());
