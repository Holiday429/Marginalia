// Entry point for Vite. Imports all non-CDN, non-module scripts in their
// original load order. CDN scripts (Firebase compat, amCharts) and the two
// existing ES module scripts (room-scene.js, hero-glb.js) stay in index.html.

import { APP_VERSION } from './core/version.ts';
import { M } from './core/namespace.ts';
console.debug('[marginalia] version', APP_VERSION);

// M is the single namespace root. All migrated globals are registered below
// alongside their window.X shims. window.M is exported for bridge code.
// TODO(p0-cleanup): remove window.M after phase 3 — callers should import M directly.
window.M = M;

// 1. Schema + type system
import { BOOK_TYPES, BookTypes } from './data/schema/book-types.js';
import { PanelRegistry } from './book/panels/registry.js';
import { AIFeatureRegistry } from './ai/features/registry.js';
M.data.BOOK_TYPES = BOOK_TYPES;
M.data.BookTypes = BookTypes;
M.ui.PanelRegistry = PanelRegistry;
M.ai.AIFeatureRegistry = AIFeatureRegistry;

// 1b. Mock / seed data
import { BOOKS, SHELF_BOOKS } from './data/mock/seed-spines.js';
import { BOOKLIST_CURATED } from './data/mock/curated-booklist.js';
import { __SEED_SAPIENS } from './data/seed/sapiens.js';
import { BOOK_DETAILS, BOOK_BY_ID } from './data/seed/index.js';
M.data.BOOKS = BOOKS;
M.data.SHELF_BOOKS = SHELF_BOOKS;
M.data.BOOKLIST_CURATED = BOOKLIST_CURATED;
M.data.__SEED_SAPIENS = __SEED_SAPIENS;
M.data.BOOK_DETAILS = BOOK_DETAILS;
M.data.BOOK_BY_ID = BOOK_BY_ID;

// 2. Firebase layer
import { MARGINALIA_FIREBASE } from './firebase/config.js';
import { MarginaliaAuth } from './firebase/auth.js';
import { MarginaliaBooksCloud, MarginaliaStorage } from './firebase/db.js';
M.services.MARGINALIA_FIREBASE = MARGINALIA_FIREBASE;
M.services.MarginaliaAuth = MarginaliaAuth;
M.services.MarginaliaBooksCloud = MarginaliaBooksCloud;
M.services.MarginaliaStorage = MarginaliaStorage;

// 3. State stores
import { NotesStore } from './store/notes-store.js';
import { BooksStore } from './store/books-store.js';
import { EntitlementsStore } from './store/entitlements-store.ts';
M.store.NotesStore = NotesStore;
M.store.BooksStore = BooksStore;
M.store.EntitlementsStore = EntitlementsStore;

// 4. Core app utilities
import { MarginaliaGraph } from './core/graph-data.js';
M.store.MarginaliaGraph = MarginaliaGraph;
import { PanelManager } from './core/panel-manager.js';
import { App, renderPrimaryHeader, renderUnifiedPanelHeader, renderToolPageShell } from './core/app.js';
M.ui.App = App;
import { openConceptDrawer, closeConceptDrawer } from './core/concept-ui.js';
M.ui.PanelManager = PanelManager;
M.ui.renderPrimaryHeader = renderPrimaryHeader;
M.ui.renderUnifiedPanelHeader = renderUnifiedPanelHeader;
M.ui.renderToolPageShell = renderToolPageShell;
M.ui.openConceptDrawer = openConceptDrawer;
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
import { AIGenerateUI } from './ai/client/generate-ui.js';
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

// 6. Views (studio/room-scene.js and preloader/hero-glb.js stay in index.html as type="module")
// window.__heroGLBReadyPromise is set by hero-glb.js (HTML script tag, not bundled — see ADR 0002)
import { enterPreloader } from './preloader/preloader.js';
M.views.enterPreloader = enterPreloader;
import { initShelf, enterShelf, enterPanel_shelf, renderShelfSection } from './shelf/shelf.js';
import { initLibrary, enterLibrary, enterPanel_library } from './studio/studio.js';
import { initRoom, enterRoom, renderRoomTopTabs } from './three-room/three-room-view.js';
import { initBooklist, enterBooklist, enterPanel_booklist } from './booklist/booklist.js';
import { initBook, enterBook, enterPanel_book } from './book/book.js';
import { initMap, enterMap, enterPanel_map, mapAddBook } from './map/map.js';
import { initWeb, enterWeb, enterPanel_web } from './web/web.js';
M.views.initShelf = initShelf; M.views.enterShelf = enterShelf; M.views.enterPanel_shelf = enterPanel_shelf;
M.views.initLibrary = initLibrary; M.views.enterLibrary = enterLibrary; M.views.enterPanel_library = enterPanel_library;
M.views.initRoom = initRoom; M.views.enterRoom = enterRoom; M.views.renderRoomTopTabs = renderRoomTopTabs;
M.views.initBooklist = initBooklist; M.views.enterBooklist = enterBooklist; M.views.enterPanel_booklist = enterPanel_booklist;
M.views.initBook = initBook; M.views.enterBook = enterBook; M.views.enterPanel_book = enterPanel_book;
M.views.initMap = initMap; M.views.enterMap = enterMap; M.views.enterPanel_map = enterPanel_map; M.views.mapAddBook = mapAddBook;
M.views.initWeb = initWeb; M.views.enterWeb = enterWeb; M.views.enterPanel_web = enterPanel_web;
M.ui.renderShelfSection = renderShelfSection;
