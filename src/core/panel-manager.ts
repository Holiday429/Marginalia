/* ==========================================================================
   Marginalia · Panel Manager
   --------------------------------------------------------------------------
   Manages overlay panels that appear above the 3D room shell.
   Panels: 'search' | 'library' | 'map' | 'book' | 'todo' | 'profile' | 'web'
   ========================================================================== */

import { logError } from '../services/analytics.ts';
import { loadView } from './view-registry.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ViewFn = (params?: any) => void;

// Minimal shape PanelManager needs from the room scene handle — the full
// RoomScene type lives in the still-untyped three-room-view.js (Phase 4 step 4).
interface RoomHandle {
  pause(): void;
  resume(): void;
}

interface TransitionInput {
  origin?: string;
  originX?: string;
  originY?: string;
  source?: string;
  suppressRoomBackdrop?: boolean;
}

interface TransitionMeta {
  origin: string;
  originX: string;
  originY: string;
  source: string;
  suppressRoomBackdrop: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PanelParams = Record<string, any>;

const PANEL_IDS = ['search', 'library', 'map', 'book', 'todo', 'profile', 'web'];
const PANEL_ALIASES: Record<string, string> = {
  graph: 'web',
  studio: 'library',
  shelf: 'search',
};

const FULL_COVER_PANELS = new Set(['search', 'library', 'map', 'book', 'web', 'todo', 'profile']);

// Panels whose DOM element has a non-standard ID (not panel-{id})
const PANEL_ELEMENT_ID: Record<string, string> = {
  search: 'view-search',
};

// Maps panel ID → body[data-view] value used by CSS selectors
const PANEL_DATA_VIEW: Record<string, string> = {
  search:   'search',
  library:  'library-2d',
  map:      'map',
  book:     'book',
  web:      'web',
  todo:     'todo',
  profile:  'profile',
};

const PANEL_ORIGIN_BY_ID: Record<string, string> = {
  search: 'left',
  library: 'left',
  map: 'desk-left',
  web: 'wall',
  book: 'desk',
  profile: 'desk-right',
  todo: 'right',
};

const ORIGIN_COORD_BY_KEY: Record<string, [string, string]> = {
  left: ['18%', '52%'],
  'desk-left': ['38%', '60%'],
  wall: ['50%', '22%'],
  desk: ['52%', '62%'],
  'desk-right': ['66%', '58%'],
  right: ['82%', '52%'],
  center: ['50%', '50%'],
};

const PANEL_ENTER_MS = 560;
const PANEL_EXIT_MS = 360;

const PanelManager = (() => {
  let _roomHandle: RoomHandle | null = null;
  let _activePanel: string | null = null;
  let _activeParams: PanelParams = {};
  let _pendingTransition: TransitionMeta | null = null;

  function setRoomHandle(handle: RoomHandle): void {
    _roomHandle = handle;
  }

  const _initialized = new Set<string>();

  function normalizePanelId(panelId: string): string {
    return PANEL_ALIASES[panelId] || panelId;
  }

  function getPanelElement(panelId: string): HTMLElement | null {
    const elId = PANEL_ELEMENT_ID[panelId] || `panel-${panelId}`;
    return document.getElementById(elId);
  }

  function ensureTransitionOverlay(): HTMLElement {
    let overlay = document.getElementById('roomTransitionOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'roomTransitionOverlay';
    overlay.className = 'room-transition-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    document.body.appendChild(overlay);
    return overlay;
  }

  function normalizeTransition(input: TransitionInput = {}, panelId = ''): TransitionMeta {
    const origin = String(input.origin || PANEL_ORIGIN_BY_ID[panelId] || 'center');
    const fallbackCoords = ORIGIN_COORD_BY_KEY[origin] || ORIGIN_COORD_BY_KEY.center;
    const originX = input.originX || fallbackCoords[0];
    const originY = input.originY || fallbackCoords[1];

    return {
      origin,
      originX,
      originY,
      source: input.source || 'panel',
      suppressRoomBackdrop: !!input.suppressRoomBackdrop,
    };
  }

  function setTransitionCssVars(meta: TransitionMeta | null): void {
    if (!meta) return;
    document.body.style.setProperty('--room-origin-x', String(meta.originX));
    document.body.style.setProperty('--room-origin-y', String(meta.originY));
    document.body.dataset.panelTransitionOrigin = meta.origin;
  }

  function clearTransitionCssVars(): void {
    document.body.style.removeProperty('--room-origin-x');
    document.body.style.removeProperty('--room-origin-y');
    delete document.body.dataset.panelTransitionOrigin;
  }

  function showTransitionOverlay(meta: TransitionMeta | null, phase: 'enter' | 'leave' = 'enter'): void {
    const overlay = ensureTransitionOverlay();
    setTransitionCssVars(meta);

    overlay.classList.remove('is-active', 'is-leaving');
    overlay.classList.toggle('is-solid', !!meta?.suppressRoomBackdrop);
    overlay.hidden = false;
    if (phase === 'leave') overlay.classList.add('is-leaving');

    requestAnimationFrame(() => {
      overlay.classList.add('is-active');
    });
  }

  function hideTransitionOverlay(): void {
    const overlay = document.getElementById('roomTransitionOverlay');
    if (!overlay) {
      clearTransitionCssVars();
      return;
    }

    overlay.classList.remove('is-active', 'is-leaving');
    window.setTimeout(() => {
      overlay.hidden = true;
      clearTransitionCssVars();
    }, 300);
  }

  function primeTransition(input: TransitionInput = {}, panelId = ''): void {
    _pendingTransition = normalizeTransition(input, normalizePanelId(panelId));
    showTransitionOverlay(_pendingTransition, 'enter');
  }

  function consumeTransition(params: PanelParams = {}, panelId = ''): TransitionMeta {
    const fromParams = params && params.__roomTransition ? params.__roomTransition : null;
    const meta = normalizeTransition(fromParams || _pendingTransition || {}, panelId);
    _pendingTransition = null;
    return meta;
  }

  function open(panelId: string, params: PanelParams = {}): void {
    const canonicalPanelId = normalizePanelId(panelId);
    if (!PANEL_IDS.includes(canonicalPanelId)) {
      logError(new Error(`[PanelManager] Unknown panel: "${canonicalPanelId}"`), { panelId: canonicalPanelId });
      return;
    }

    if (_activePanel && _activePanel !== canonicalPanelId) {
      _closeActivePanel({ skipResume: true, animate: false });
    }

    const transitionMeta = consumeTransition(params, canonicalPanelId);
    const isRoomOrigin = transitionMeta.source === 'room';
    if (isRoomOrigin) showTransitionOverlay(transitionMeta, 'enter');

    _activePanel = canonicalPanelId;
    _activeParams = params;

    const el = getPanelElement(canonicalPanelId);
    if (el) {
      el.hidden = false;
      el.dataset.panelActive = 'true';
      el.classList.remove('is-exiting', 'is-entered');
      void el.offsetWidth;
      el.classList.add('is-entering');
      requestAnimationFrame(() => {
        el.classList.add('is-entered');
      });

      window.setTimeout(() => {
        el.classList.remove('is-entering');
      }, PANEL_ENTER_MS);
    }

    document.body.dataset.panel = canonicalPanelId;
    if (isRoomOrigin && !transitionMeta.suppressRoomBackdrop) document.body.classList.add('is-room-panel-entering');
    // Sync body[data-view] so existing view CSS selectors keep working
    if (PANEL_DATA_VIEW[canonicalPanelId]) document.body.dataset.view = PANEL_DATA_VIEW[canonicalPanelId];

    if (FULL_COVER_PANELS.has(canonicalPanelId) && _roomHandle) {
      _roomHandle.pause();
    }

    // The panel-open event and scroll reset happen immediately — they don't
    // depend on the view's code having loaded. init/enterPanel are resolved
    // from the (possibly still-loading) view module and run whenever that
    // resolves; the transition overlay/animation above already covers the gap
    // on first visit to a given view, so there's nothing to block on here.
    window.scrollTo({ top: 0 });
    window.dispatchEvent(new CustomEvent('marginalia:panel-open', {
      detail: { panelId: canonicalPanelId, params, transition: transitionMeta }
    }));

    loadView(canonicalPanelId).then((view) => {
      // Bail if another panel was opened while this view's chunk was loading.
      if (_activePanel !== canonicalPanelId) return;

      if (!_initialized.has(canonicalPanelId)) {
        try { (view.init as ViewFn | undefined)?.(params); } catch (e) {
          logError(e instanceof Error ? e : new Error(String(e)), { context: `PanelManager init ${canonicalPanelId}` });
        }
        _initialized.add(canonicalPanelId);
      }
      (view.enterPanel as ViewFn | undefined)?.(params);
    }).catch((e) => {
      logError(e instanceof Error ? e : new Error(String(e)), { context: `PanelManager load ${canonicalPanelId}` });
    });

    if (isRoomOrigin) {
      window.setTimeout(() => {
        document.body.classList.remove('is-room-panel-entering');
        hideTransitionOverlay();
      }, Math.max(320, PANEL_ENTER_MS - 120));
    }
  }

  function close(panelId: string): void {
    const canonicalPanelId = normalizePanelId(panelId);
    if (_activePanel !== canonicalPanelId) return;
    _closeActivePanel({ skipResume: false, animate: true });
  }

  function closeAll(): void {
    _closeActivePanel({ skipResume: false, animate: true });
  }

  function _closeActivePanel({ skipResume = false, animate = true }: { skipResume?: boolean; animate?: boolean } = {}): void {
    if (!_activePanel) return;
    const panelId = _activePanel;
    const activeParamsSnapshot = _activeParams;
    const transitionMeta = normalizeTransition(activeParamsSnapshot.__roomTransition || {}, panelId);
    const el = getPanelElement(panelId);

    const finalizeClose = () => {
      if (el) {
        el.hidden = true;
        delete el.dataset.panelActive;
        el.classList.remove('is-entering', 'is-entered', 'is-exiting');
      }

      document.body.dataset.panel = '';
      document.body.dataset.view = 'room';
      document.body.classList.remove('is-room-panel-leaving');
      _activePanel = null;
      _activeParams = {};

      if (!skipResume && FULL_COVER_PANELS.has(panelId) && _roomHandle) {
        _roomHandle.resume();
      }

      hideTransitionOverlay();

      window.dispatchEvent(new CustomEvent('marginalia:panel-close', {
        detail: { panelId, transition: transitionMeta }
      }));
    };

    if (!animate) {
      finalizeClose();
      return;
    }

    if (!transitionMeta.suppressRoomBackdrop) document.body.classList.add('is-room-panel-leaving');
    showTransitionOverlay(transitionMeta, 'leave');

    if (el) {
      el.classList.remove('is-entering');
      el.classList.add('is-exiting');
      el.classList.remove('is-entered');
    }

    window.setTimeout(finalizeClose, PANEL_EXIT_MS);
  }

  function getActive(): string | null {
    return _activePanel;
  }

  return { open, close, closeAll, setRoomHandle, getActive, primeTransition };
})();

export { PanelManager };
