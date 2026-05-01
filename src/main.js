// Entry point for Vite. Imports all non-CDN, non-module scripts in their
// original load order. CDN scripts (Firebase compat, amCharts) and the two
// existing ES module scripts (room-scene.js, hero-glb.js) stay in index.html.

// 1. Schema + type system
import './data/schema/book-types.js';
import './book/panels/registry.js';
import './ai/features/registry.js';

// 1b. Mock / seed data
import './data/mock/seed-spines.js';
import './data/mock/curated-booklist.js';
import './data/seed/sapiens.js';
import './data/seed/index.js';

// 2. Firebase layer
import './firebase/config.js';
import './firebase/auth.js';
import './firebase/db.js';

// 3. State stores
import './store/books-store.js';
import './store/notes-store.js';

// 4. Core app utilities
import './core/graph-data.js';
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
import './booklist/booklist.js';
import './book/book.js';
import './map/map.js';
import './web/web.js';
