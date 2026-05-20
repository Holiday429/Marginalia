// Marginalia · View registry
// Static map of viewId → { init?, enter?, enterPanel? }.
// Both app.js (show()) and panel-manager.js (open()) read from here
// instead of doing window['initX'] / window['enterX'] dynamic lookups.
//
// "view" ids match the panel/view ids used by App.show() and PanelManager.open().
// The room view (initRoom/enterRoom) is registered here even though it is managed
// separately by app.js showRoom() — panel-manager may call initRoom on first open.

import { initSearch, enterSearch, enterPanel_search } from '../search/search.js';
import { initLibrary, enterLibrary, enterPanel_library } from '../library-2d/library-2d.js';
import { initRoom, enterRoom } from '../three-room/three-room-view.js';
import { initBook, enterBook, enterPanel_book } from '../book/book.js';
import { initMap, enterMap, enterPanel_map } from '../map/map.js';
import { initWeb, enterWeb, enterPanel_web } from '../web/web.js';
import { initProfile, enterProfile, enterPanel_profile } from '../profile/profile.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ViewFn = (params?: any) => void;

interface ViewEntry {
  init?: ViewFn;
  enter?: ViewFn;
  enterPanel?: ViewFn;
}

export const VIEW_REGISTRY: Record<string, ViewEntry> = {
  search:   { init: initSearch,   enter: enterSearch,   enterPanel: enterPanel_search },
  library:  { init: initLibrary,  enter: enterLibrary,  enterPanel: enterPanel_library },
  room:     { init: initRoom,     enter: enterRoom },
  book:     { init: initBook,     enter: enterBook,     enterPanel: enterPanel_book },
  map:      { init: initMap,      enter: enterMap,      enterPanel: enterPanel_map },
  web:      { init: initWeb,      enter: enterWeb,      enterPanel: enterPanel_web },
  profile:  { init: initProfile,  enter: enterProfile,  enterPanel: enterPanel_profile },
};
