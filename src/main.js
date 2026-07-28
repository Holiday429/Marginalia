// Entry point for Vite. Imports all non-CDN, non-module scripts in their
// original load order. CDN scripts (Firebase compat, amCharts) and the two
// existing ES module scripts (room-scene.js, hero-glb.js) stay in index.html.

import { APP_VERSION } from './core/version.ts';
import { M } from './core/namespace.ts';
import { initAnalytics } from './services/analytics.ts';
import { setLanguage } from './core/i18n.ts';
console.debug('[marginalia] version', APP_VERSION);
initAnalytics();

// Warn when localhost is connected to the prod Firebase project (`npm run dev:prod`).
// This is intentional but easy to forget — show a persistent corner badge.
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || '';
  const isProd = !projectId.includes('dev');
  if (isProd && !document.getElementById('env-prod-badge')) {
    const badge = document.createElement('div');
    badge.id = 'env-prod-badge';
    badge.textContent = `⚠ LIVE: ${projectId}`;
    Object.assign(badge.style, {
      position: 'fixed', bottom: '10px', left: '10px', zIndex: '99999',
      padding: '6px 10px', background: '#c24a2a', color: '#fff',
      fontFamily: 'monospace', fontSize: '11px', borderRadius: '3px',
      pointerEvents: 'none', letterSpacing: '0.05em',
    });
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(badge), { once: true });
  }
}

// M is the single namespace root. All migrated globals are registered on it
// for legacy bridge code that still reads via M.*.

// 1. Schema + type system
import './data/schema/book-types.ts';
import { PanelRegistry } from './book/panels/registry.ts';
import './ai/features/registry.ts';

// 2. Firebase layer
import { doc, getDoc } from 'firebase/firestore';
import { MarginaliaAuth } from './firebase/auth.ts';
import { MarginaliaBooksCloud, MarginaliaStorage } from './firebase/db.ts';

// 3. State stores
import { NotesStore } from './store/notes-store.ts';
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

// 4. Core app utilities
import './core/graph-data.ts';
import { PanelManager } from './core/panel-manager.ts';
import { App, registerPreloader, renderPrimaryHeader, renderUnifiedPanelHeader, renderToolPageShell } from './core/app.ts';
import { openConceptDrawer, closeConceptDrawer } from './core/concept-ui.ts';

// 4b. API adapters
import { KindleImport } from './api/kindle-import.ts';

// 5. Shared components
import { SpineCard } from './components/spine-card.ts';
import { NewEntry } from './new-entry/new-entry.ts';

// 6a. AI layer
import './services/ai-gateway.ts';
import './ai/client/generate-ui.ts';
import './ai/features/prompts/mindmap-gen.js';
import './ai/features/prompts/concept-cards.js';
import './ai/features/prompts/argument-breakdown.js';
import './ai/features/prompts/timeline-gen.js';
import './ai/features/prompts/action-suggest.js';
import './ai/features/prompts/reader-portrait.js';
import './ai/features/prompts/reader-identity.js';
import './ai/features/prompts/character-map.js';
import './ai/features/prompts/geo-context.js';
import './ai/features/prompts/reading-card.js';

// 6b. Panel scripts
import './book/panels/notes.js';
import './book/panels/claude-import.js';
import './book/panels/actions.js';
import './book/panels/actions.css';

// 6. Views (three-room/room-scene.js and preloader/hero-glb.js stay in index.html as type="module")
// window.__heroGLBReadyPromise is set by hero-glb.js (HTML script tag, not bundled — see ADR 0002)
//
// search and room/three-room-view stay eager: search is the default landing
// view after the preloader, room is the persistent 3D shell shown immediately
// after it — neither benefits from lazy loading. library/book/map/web/profile
// are NOT imported here — src/core/view-registry.ts dynamically imports each
// on first navigation (see loadView()), so their bundle chunks (and, for
// map/web, the amCharts5/D3 chunks they in turn load) are only fetched once
// the user actually visits that view.
import { enterPreloader } from './preloader/preloader.js';
registerPreloader(enterPreloader);
import './search/search.js';
import './three-room/three-room-view.js';

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
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
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
