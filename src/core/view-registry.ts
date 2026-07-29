// Marginalia · View registry
// Lazy-loaded map of viewId → a loader that resolves the view's module.
// Both app.js (show()) and panel-manager.js (open()) call loadView(id) to get
// { init?, enter?, enterPanel? } — the underlying view module is only fetched
// (and its bundle chunk downloaded) the first time its id is requested.
//
// "view" ids match the panel/view ids used by App.show() and PanelManager.open().
// The room view (initRoom/enterRoom) is registered here even though it is managed
// separately by app.js showRoom() — panel-manager may call initRoom on first open.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ViewFn = (params?: any) => void;

interface ViewEntry {
  init?: ViewFn;
  enter?: ViewFn;
  enterPanel?: ViewFn;
}

type ViewLoader = () => Promise<ViewEntry>;

const VIEW_LOADERS: Record<string, ViewLoader> = {
  search: () => import('../search/search.js').then((m) => ({
    init: m.initSearch, enter: m.enterSearch, enterPanel: m.enterPanel_search,
  })),
  library: () => import('../library-2d/library-2d.js').then((m) => ({
    init: m.initLibrary, enter: m.enterLibrary, enterPanel: m.enterPanel_library,
  })),
  room: () => import('../three-room/three-room-view.js').then((m) => ({
    init: m.initRoom, enter: m.enterRoom,
  })),
  book: () => import('../book/book.js').then((m) => ({
    init: m.initBook, enter: m.enterBook, enterPanel: m.enterPanel_book,
  })),
  map: () => import('../map/map.ts').then((m) => ({
    init: m.initMap, enter: m.enterMap, enterPanel: m.enterPanel_map,
  })),
  web: () => import('../web/web.js').then((m) => ({
    init: m.initWeb, enter: m.enterWeb, enterPanel: m.enterPanel_web,
  })),
  profile: () => import('../profile/profile.ts').then((m) => ({
    init: m.initProfile, enter: m.enterProfile, enterPanel: m.enterPanel_profile,
  })),
};

// Cache resolved entries so repeat navigation to an already-loaded view is
// synchronous in practice (no re-import, no re-await) after the first visit.
const _resolved = new Map<string, ViewEntry>();
const _pending = new Map<string, Promise<ViewEntry>>();

/** Resolve a view's { init, enter, enterPanel } — fetches its chunk on first call. */
export function loadView(id: string): Promise<ViewEntry> {
  const cached = _resolved.get(id);
  if (cached) return Promise.resolve(cached);
  const inflight = _pending.get(id);
  if (inflight) return inflight;
  const loader = VIEW_LOADERS[id];
  if (!loader) return Promise.resolve({});
  const promise = loader().then((entry) => {
    _resolved.set(id, entry);
    _pending.delete(id);
    return entry;
  });
  _pending.set(id, promise);
  return promise;
}

/** Synchronous best-effort read — returns {} if the view hasn't loaded yet. */
export function getLoadedView(id: string): ViewEntry {
  return _resolved.get(id) || {};
}
