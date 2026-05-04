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
M.store.NotesStore = NotesStore;
M.store.BooksStore = BooksStore;

// 4. Core app utilities
import { MarginaliaGraph } from './core/graph-data.js';
M.store.MarginaliaGraph = MarginaliaGraph;
import './core/panel-manager.js';
import './core/app.js';
import './core/concept-ui.js';

// 4b. API adapters
import './api/kindle-import.js';

// 5. Shared components
import './components/spine-card.js';
import './new-entry/new-entry.js';

// 6a. AI layer
import './ai/client/api.js';
import './ai/client/generate-ui.js';
import './ai/features/prompts/mindmap-gen.js';
import './ai/features/prompts/concept-cards.js';
import './ai/features/prompts/argument-breakdown.js';
import './ai/features/prompts/timeline-gen.js';
import './ai/features/prompts/action-suggest.js';
import './ai/settings/ai-settings.js';

// 6b. Panel scripts
import './book/panels/notes.js';
import './book/panels/claude-import.js';

// 6. Views (studio/room-scene.js and preloader/hero-glb.js stay in index.html as type="module")
import './preloader/preloader.js';
import './shelf/shelf.js';
import './studio/studio.js';
import './three-room/three-room-view.js';
import './booklist/booklist.js';
import './book/book.js';
import './map/map.js';
import './web/web.js';
