import { createThreeRoomPreview } from './three-room.js';
import { PanelManager } from '../core/panel-manager.js';
import { App } from '../core/app.js';
import { attachFocusWidgetTo } from '../components/reading-session/focus-widget.ts';
import { MarginaliaAuth } from '../firebase/auth.js';
import { BooksStore } from '../store/books-store.ts';
import { NewEntry } from '../new-entry/new-entry.js';

const SPACE_ITEMS = [
  { id: 'shelf', label: 'Shelf', icon: 'shelf' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'web', label: 'Graph', icon: 'graph' },
  { id: 'booklist', label: 'Booklist', icon: 'list' },
];

const QUICK_ACTION_ITEMS = [
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'add-book', label: 'Add Book', icon: 'add-book' },
  { id: 'reading-now', label: 'Reading Now', icon: 'reading-now' },
  { id: 'todo', label: 'To Do', icon: 'todo' },
];

const COLLAPSED_TAB_ITEMS = [
  { id: 'shelf', label: 'Shelf', icon: 'shelf' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'web', label: 'Graph', icon: 'graph' },
  { id: 'booklist', label: 'Booklist', icon: 'list' },
  { id: 'todo', label: 'To Do', icon: 'todo' },
];
const ROOM_AVATAR_STORAGE_KEY = 'marginalia_room_avatar_data_url';

const HOVER_META_BY_ACTION = {
  map: { icon: 'map', title: 'Map', description: 'Explore Reading Places' },
  shelf: { icon: 'search', title: 'Search', description: 'Find Books And Notes' },
  organize: { icon: 'shelf', title: 'Shelf', description: 'Browse Your Collection' },
  sapiens: { icon: 'reading-now', title: 'Keep Reading', description: 'Continue Current Book' },
  heroBook: { icon: 'booklist', title: 'Open Library', description: 'Enter Book Space' },
};

const ROOM_VIEW_STATE = {
  pose: 'front',
  skinId: 'warm-study',
  handle: null,
  transitionTimer: null,
  transitioning: false,
  bound: false,
  sidebarCollapsed: true,
  settingsOpen: false,
  freeLook: false,
  hoverAction: null,
  hoverPoint: { x: 0, y: 0 },
  authBound: false,
};

const PANEL_POSES = {
  library: 'shelf',
  shelf: 'shelf',
  map: 'approach',
  book: 'approach',
  todo: 'notes',
  profile: 'front',
  web: 'notes',
  booklist: 'front',
};

const PANEL_TRANSITION_MS = {
  library: 420,
  shelf: 420,
  map: 460,
  book: 360,
  todo: 430,
  profile: 320,
  web: 460,
  booklist: 360,
};

const HASH_ROUTED_PANELS = new Set(['shelf', 'map', 'web', 'booklist']);
const ROOM_TRANSITION_ORIGIN_MAP = {
  library: 'left',
  shelf: 'left',
  map: 'desk-left',
  web: 'wall',
  graph: 'wall',
  book: 'desk',
  booklist: 'desk',
  profile: 'desk-right',
  todo: 'right',
};
const ROOM_TRANSITION_COORD_MAP = {
  left: ['18%', '52%'],
  'desk-left': ['38%', '60%'],
  wall: ['50%', '22%'],
  desk: ['52%', '62%'],
  'desk-right': ['66%', '58%'],
  right: ['82%', '52%'],
  center: ['50%', '50%'],
};

function buildRoomMarkup() {
  return `
    <div class="room-shell" data-room-shell>
      <section class="room-scene-layer" aria-label="Room Scene">
        <div class="room-experience-stage" id="roomExperienceStage"></div>
        <div class="room-transition-curtain" id="roomTransitionCurtain" aria-hidden="true"></div>
      </section>

      <aside class="room-sidebar" id="roomSidebar">
        <header class="room-sidebar-head">
          <button class="room-icon-btn room-menu-toggle" type="button" id="roomSidebarToggleBtn" aria-label="Collapse Menu">
            ${renderMenuToggleIcon()}
          </button>
          <h1 class="room-title" id="roomTitle">Room</h1>
        </header>

        <section class="room-user-zone" aria-label="Account">
          <button class="room-user-avatar-btn" type="button" id="roomUserCard" data-auth-trigger aria-label="Open Login Panel">
            <span class="room-user-avatar" id="roomUserAvatar" aria-hidden="true">R</span>
          </button>
        </section>

        <section class="room-sidebar-group room-sidebar-group--spaces">
          <h2 class="room-group-title">Spaces</h2>
          ${renderNavItems(SPACE_ITEMS, 'room-nav')}
        </section>

        <section class="room-sidebar-group room-sidebar-group--actions">
          <h2 class="room-group-title">Quick Actions</h2>
          ${renderNavItems(QUICK_ACTION_ITEMS, 'room-action')}
        </section>

        <div class="room-focus-slot" id="roomFocusWidgetSlot"></div>
      </aside>

      ${renderRoomTopTabsMarkup()}

      <button class="room-icon-btn room-settings-trigger" type="button" id="roomSettingsTrigger" aria-label="Open Settings">
        <span class="room-gear">⚙</span>
      </button>

      <section class="room-settings-panel" id="roomSettingsPanel" aria-label="Room Settings">
        <header class="room-settings-head">
          <h2>Settings</h2>
          <button class="room-icon-btn" type="button" data-room-close-settings aria-label="Close Settings">x</button>
        </header>

        <div class="room-settings-block">
          <h3>Room Atmosphere</h3>
          <div class="room-chip-row">
            <button type="button" class="room-chip active" data-room-atmosphere="morning">Morning</button>
            <button type="button" class="room-chip" data-room-atmosphere="afternoon">Afternoon</button>
            <button type="button" class="room-chip" data-room-atmosphere="dusk">Dusk</button>
            <button type="button" class="room-chip" data-room-atmosphere="night">Night</button>
          </div>
        </div>

        <div class="room-settings-block">
          <h3>Room Theme</h3>
          <div class="room-chip-row">
            <button type="button" class="room-chip active" data-room-theme="taupe">Taupe</button>
            <button type="button" class="room-chip" data-room-theme="ink">Ink</button>
            <button type="button" class="room-chip" data-room-theme="cream">Cream</button>
            <button type="button" class="room-chip" data-room-theme="sage">Sage</button>
            <button type="button" class="room-chip" data-room-theme="clay">Clay</button>
          </div>
        </div>

        <div class="room-settings-block">
          <h3>Background Music</h3>
          <div class="room-music-card">
            <div class="room-music-cover" aria-hidden="true"></div>
            <div class="room-music-meta">
              <strong>Forest Lullabye</strong>
              <span>Ambient Demo</span>
            </div>
          </div>
          <label class="room-slider-label" for="roomMusicVolume">Volume</label>
          <input id="roomMusicVolume" type="range" min="0" max="100" value="62">
        </div>

        <div class="room-settings-block">
          <h3>Ambient Effects</h3>
          <div class="room-chip-row">
            <button type="button" class="room-chip" data-room-effect="rain">Rain</button>
            <button type="button" class="room-chip active" data-room-effect="vinyl-noise">Vinyl Noise</button>
            <button type="button" class="room-chip" data-room-effect="fireplace">Fireplace</button>
          </div>
        </div>
      </section>

      <section class="room-camera-toolbar" id="roomCameraToolbar" aria-label="Camera Angles">
        <button class="room-camera-btn active" type="button" data-room-pose="front">Front</button>
        <button class="room-camera-btn" type="button" data-room-pose="approach">Desk</button>
        <button class="room-camera-btn" type="button" data-room-pose="shelf">Shelf Wall</button>
        <button class="room-camera-btn" type="button" data-room-pose="notes">Notes Wall</button>
        <button class="room-camera-btn" type="button" id="roomFreeLookBtn">Free Look</button>
      </section>

      <div class="room-hover-card" id="roomHoverBadge" hidden>
        <span class="room-hover-icon" id="roomHoverIcon" aria-hidden="true"></span>
        <span class="room-hover-copy">
          <strong id="roomHoverTitle"></strong>
          <span id="roomHoverDesc"></span>
        </span>
      </div>
    </div>
  `;
}

function renderMenuToggleIcon() {
  return `
    <svg viewBox="0 0 24 24" class="room-svg-icon room-svg-icon--menu" aria-hidden="true">
      <path d="M5 8.5h14M5 12h10M5 15.5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
    </svg>
  `;
}

function renderRoomTopTabsMarkup({
  activeId = '',
  dataAttr = 'room-nav',
  className = 'room-top-tabs',
  ariaLabel = 'Room Top Tabs',
} = {}) {
  return `
    <nav class="${className}" aria-label="${ariaLabel}">
      ${renderNavItems(COLLAPSED_TAB_ITEMS, dataAttr, activeId)}
    </nav>
  `;
}

function renderNavItems(items, dataAttr, activeId = '') {
  return items.map((item) => `
    <button class="room-nav-item${item.id === activeId ? ' is-active' : ''}" type="button" data-${dataAttr}="${item.id}" aria-label="${item.label}">
      <span class="room-nav-icon" aria-hidden="true">${renderIcon(item.icon)}</span>
      <span class="room-nav-label">${item.label}</span>
    </button>
  `).join('');
}

function renderIcon(iconId) {
  if (iconId === 'shelf') return symbolIcon('icon-nav-shelf');
  if (iconId === 'map') return symbolIcon('icon-nav-map');
  if (iconId === 'graph') return symbolIcon('icon-nav-graph');
  if (iconId === 'list' || iconId === 'booklist') return symbolIcon('icon-nav-list');
  if (iconId === 'search') {
    return `
      <svg viewBox="0 0 18 18" class="room-svg-icon">
        <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
        <path d="M11.8 11.8 15 15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
      </svg>
    `;
  }
  if (iconId === 'add-book') {
    return `
      <svg viewBox="0 0 18 18" class="room-svg-icon">
        <rect x="3" y="2.5" width="9" height="13" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.4"></rect>
        <path d="M13.2 6.2h2.6M14.5 4.9v2.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
      </svg>
    `;
  }
  if (iconId === 'reading-now') {
    return `
      <svg viewBox="0 0 18 18" class="room-svg-icon">
        <path d="M2.6 4.3c1.8-.9 3.5-.9 5.2 0v9.1c-1.7-.9-3.4-.9-5.2 0z" fill="none" stroke="currentColor" stroke-width="1.4"></path>
        <path d="M15.4 4.3c-1.8-.9-3.5-.9-5.2 0v9.1c1.7-.9 3.4-.9 5.2 0z" fill="none" stroke="currentColor" stroke-width="1.4"></path>
      </svg>
    `;
  }
  if (iconId === 'todo') {
    return `
      <svg viewBox="0 0 18 18" class="room-svg-icon">
        <path d="M3 4.6h12M3 8.9h12M3 13.2h12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"></path>
        <path d="M3.2 4.6 4 5.3l1.2-1.2M3.2 8.9 4 9.6l1.2-1.2M3.2 13.2 4 13.9l1.2-1.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `;
  }
  return symbolIcon('icon-nav-library');
}

function symbolIcon(symbolId) {
  return `<svg viewBox="0 0 16 16" class="room-svg-icon"><use href="#${symbolId}"></use></svg>`;
}

function initRoom() {
  const host = document.getElementById('view-room');
  if (!host) return;

  ROOM_VIEW_STATE.sidebarCollapsed = true;
  ROOM_VIEW_STATE.settingsOpen = false;

  if (ROOM_VIEW_STATE.handle) {
    ROOM_VIEW_STATE.handle.destroy();
    ROOM_VIEW_STATE.handle = null;
  }

  host.innerHTML = buildRoomMarkup();
  ensureFallbackPanels();
  bindRoomEvents();
  bindAuthEvents();
  mountRoomScene();
  syncRoomChrome();
  syncRoomTitle();
  syncRoomUserCard();
  syncPoseButtons();
  syncFreeLookButton();
  const focusSlot = document.getElementById('roomFocusWidgetSlot');
  if (focusSlot) attachFocusWidgetTo(focusSlot);
}

function enterRoom() {
  ensureRoomDom();
  ensureFallbackPanels();
  mountRoomScene();
  syncRoomChrome();
  syncRoomTitle();
  syncRoomUserCard();
  syncPoseButtons();
  syncFreeLookButton();
  const focusSlot = document.getElementById('roomFocusWidgetSlot');
  if (focusSlot) attachFocusWidgetTo(focusSlot);
}

function ensureRoomDom() {
  const root = document.getElementById('view-room');
  if (!root) return;
  if (root.querySelector('[data-room-shell]') && root.querySelector('#roomExperienceStage')) return;
  if (ROOM_VIEW_STATE.handle) {
    ROOM_VIEW_STATE.handle.destroy();
    ROOM_VIEW_STATE.handle = null;
  }
  root.innerHTML = buildRoomMarkup();
}

function ensureFallbackPanels() {
  const todoPanel = document.getElementById('panel-todo');
  if (todoPanel && !todoPanel.innerHTML.trim()) {
    todoPanel.innerHTML = `
      <section class="room-fallback-panel">
        <button class="room-fallback-close" type="button" data-panel-close aria-label="Close Panel">x</button>
        <h2>To Do</h2>
        <p>Task Hub Is Ready For Your Next Workflow.</p>
      </section>
    `;
  }
}

function bindAuthEvents() {
  if (ROOM_VIEW_STATE.authBound) return;
  ROOM_VIEW_STATE.authBound = true;
  window.addEventListener('marginalia:auth-changed', () => {
    syncRoomTitle();
    syncRoomUserCard();
  });
}

function bindRoomEvents() {
  if (ROOM_VIEW_STATE.bound) return;
  ROOM_VIEW_STATE.bound = true;

  const root = document.getElementById('view-room');
  if (!root) return;

  root.addEventListener('click', (event) => {
    if (ROOM_VIEW_STATE.transitioning) return;

    if (event.target.closest('#roomSidebarToggleBtn')) {
      ROOM_VIEW_STATE.sidebarCollapsed = !ROOM_VIEW_STATE.sidebarCollapsed;
      syncRoomChrome();
      return;
    }

    if (event.target.closest('#roomSettingsTrigger')) {
      ROOM_VIEW_STATE.settingsOpen = !ROOM_VIEW_STATE.settingsOpen;
      syncRoomChrome();
      return;
    }

    if (event.target.closest('[data-room-close-settings]')) {
      ROOM_VIEW_STATE.settingsOpen = false;
      syncRoomChrome();
      return;
    }

    const poseBtn = event.target.closest('[data-room-pose]');
    if (poseBtn) {
      applyRoomPose(poseBtn.dataset.roomPose || 'front');
      return;
    }

    if (event.target.closest('#roomFreeLookBtn')) {
      ROOM_VIEW_STATE.freeLook = !ROOM_VIEW_STATE.freeLook;
      if (ROOM_VIEW_STATE.handle) ROOM_VIEW_STATE.handle.setFreeLookEnabled(ROOM_VIEW_STATE.freeLook);
      syncFreeLookButton();
      return;
    }

    const navBtn = event.target.closest('[data-room-nav]');
    if (navBtn) {
      const panelId = navBtn.dataset.roomNav;
      if (!panelId) return;
      if (panelId === 'todo') runRoomAction('todo');
      else openPanel(panelId);
      ROOM_VIEW_STATE.settingsOpen = false;
      syncRoomChrome();
      return;
    }

    const actionBtn = event.target.closest('[data-room-action]');
    if (actionBtn) {
      runRoomAction(actionBtn.dataset.roomAction || '');
      ROOM_VIEW_STATE.settingsOpen = false;
      syncRoomChrome();
      return;
    }

    const atmosphereChip = event.target.closest('[data-room-atmosphere]');
    if (atmosphereChip) {
      root.querySelectorAll('[data-room-atmosphere]').forEach((chip) => chip.classList.remove('active'));
      atmosphereChip.classList.add('active');
      applyAtmospherePreset(atmosphereChip.dataset.roomAtmosphere || 'afternoon');
      return;
    }

    const themeChip = event.target.closest('[data-room-theme]');
    if (themeChip) {
      root.querySelectorAll('[data-room-theme]').forEach((chip) => chip.classList.remove('active'));
      themeChip.classList.add('active');
      return;
    }

    const effectChip = event.target.closest('[data-room-effect]');
    if (effectChip) {
      effectChip.classList.toggle('active');
      return;
    }

    if (ROOM_VIEW_STATE.settingsOpen) {
      const panel = root.querySelector('#roomSettingsPanel');
      const trigger = root.querySelector('#roomSettingsTrigger');
      const clickedInsidePanel = panel && panel.contains(event.target);
      const clickedSettingsTrigger = trigger && trigger.contains(event.target);
      if (!clickedInsidePanel && !clickedSettingsTrigger) {
        ROOM_VIEW_STATE.settingsOpen = false;
        syncRoomChrome();
      }
    }
  });

}

function mountRoomScene() {
  const stage = document.getElementById('roomExperienceStage');
  if (!stage) return;

  if (!ROOM_VIEW_STATE.handle) {
    ROOM_VIEW_STATE.handle = createThreeRoomPreview(stage, {
      onGlobeSelect: () => openPanel('map'),
      onLaptopSelect: () => openPanel('library', { mode: 'search' }),
      onOrganizeSelect: () => openPanel('shelf'),
      onSapiensSelect: () => openPanel('book', { id: getReadingNowBookId() }),
      onHeroBookSelect: () => exitRoomViaHeroFlip(),
      onInteractiveHover: (action, pointer) => {
        ROOM_VIEW_STATE.hoverAction = action || null;
        if (pointer) ROOM_VIEW_STATE.hoverPoint = pointer;
        syncHoverBadge();
      },
    });
    PanelManager.setRoomHandle(ROOM_VIEW_STATE.handle);
  }

  if (ROOM_VIEW_STATE.handle) {
    ROOM_VIEW_STATE.handle.setSkin(ROOM_VIEW_STATE.skinId);
    ROOM_VIEW_STATE.handle.goToPose(ROOM_VIEW_STATE.pose, true);
  }

  mountHeroBookHotspot();
}

function mountHeroBookHotspot() {
  const stage = document.getElementById('roomExperienceStage');
  if (!stage) return;
  if (stage.querySelector('.room-hero-hotspot')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'room-hero-hotspot';
  btn.setAttribute('aria-label', 'Open Library');
  stage.appendChild(btn);

  btn.addEventListener('mouseenter', (e) => {
    ROOM_VIEW_STATE.hoverAction = 'heroBook';
    ROOM_VIEW_STATE.hoverPoint = { x: e.clientX, y: e.clientY };
    syncHoverBadge();
  });
  btn.addEventListener('mousemove', (e) => {
    ROOM_VIEW_STATE.hoverPoint = { x: e.clientX, y: e.clientY };
    syncHoverBadge();
  });
  btn.addEventListener('mouseleave', () => {
    ROOM_VIEW_STATE.hoverAction = null;
    syncHoverBadge();
  });
  btn.addEventListener('click', () => {
    exitRoomViaHeroFlip();
  });

  // Track the hero book's projected screen position every frame.
  let _raf = 0;
  function tick() {
    if (!ROOM_VIEW_STATE.handle || !stage.contains(btn)) return;
    const pos = ROOM_VIEW_STATE.handle.getHeroBookScreenPos();
    if (pos) {
      const rect = stage.getBoundingClientRect();
      const cx = pos.x * rect.width;
      const cy = pos.y * rect.height;
      btn.style.transform = `translate(${Math.round(cx - 44)}px, ${Math.round(cy - 60)}px)`;
      btn.hidden = pos.x < 0 || pos.x > 1 || pos.y < 0 || pos.y > 1;
    } else {
      btn.hidden = true;
    }
    _raf = requestAnimationFrame(tick);
  }
  _raf = requestAnimationFrame(tick);

  // Clean up when the room view is destroyed (handle.destroy called).
  const origDestroy = ROOM_VIEW_STATE.handle?.destroy?.bind(ROOM_VIEW_STATE.handle);
  if (ROOM_VIEW_STATE.handle && origDestroy) {
    ROOM_VIEW_STATE.handle.destroy = function() {
      cancelAnimationFrame(_raf);
      btn.remove();
      origDestroy();
    };
  }
}

function runRoomAction(action) {
  if (action === 'search') {
    openPanel('library', { mode: 'search' });
    return;
  }
  if (action === 'add-book') {
    openPanel('shelf');
    window.setTimeout(() => NewEntry?.mount?.(), 140);
    return;
  }
  if (action === 'reading-now') {
    openPanel('book', { id: getReadingNowBookId() });
    return;
  }
  if (action === 'todo') {
    openPanel('todo');
  }
}

function renderRoomTopTabs(options = {}) {
  return renderRoomTopTabsMarkup(options);
}

function getReadingNowBookId() {
  const reading = BooksStore.getAll().find((book) => String(book?.status || '').toLowerCase() === 'reading');
  return reading?.id || 'sapiens';
}

function applyRoomPose(pose) {
  const normalized = pose === 'approach' || pose === 'shelf' || pose === 'notes' ? pose : 'front';
  ROOM_VIEW_STATE.pose = normalized;
  if (ROOM_VIEW_STATE.handle) {
    ROOM_VIEW_STATE.handle.goToPose(normalized, false);
  }
  syncPoseButtons();
}

function syncPoseButtons() {
  const root = document.getElementById('view-room');
  if (!root) return;
  root.querySelectorAll('[data-room-pose]').forEach((node) => {
    node.classList.toggle('active', node.dataset.roomPose === ROOM_VIEW_STATE.pose);
  });
}

function syncFreeLookButton() {
  const btn = document.getElementById('roomFreeLookBtn');
  if (!btn) return;
  btn.classList.toggle('active', ROOM_VIEW_STATE.freeLook);
  btn.setAttribute('aria-pressed', String(ROOM_VIEW_STATE.freeLook));
}

function syncRoomChrome() {
  const root = document.getElementById('view-room');
  if (!root) return;

  root.classList.toggle('is-sidebar-collapsed', ROOM_VIEW_STATE.sidebarCollapsed);
  root.classList.toggle('is-settings-open', ROOM_VIEW_STATE.settingsOpen);

  const toggleBtn = document.getElementById('roomSidebarToggleBtn');
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-label', ROOM_VIEW_STATE.sidebarCollapsed ? 'Expand Menu' : 'Collapse Menu');
  }
}

function syncRoomTitle() {
  const title = document.getElementById('roomTitle');
  if (!title) return;

  const user = MarginaliaAuth?.user || null;
  const rawName = String(user?.displayName || '').trim();
  if (!rawName) {
    title.textContent = 'Room';
    return;
  }

  const parsedName = rawName.includes('@') ? rawName.split('@')[0] : rawName;
  const safeName = parsedName || 'Room';
  const possessive = safeName.toLowerCase().endsWith('s') ? `${safeName}' Room` : `${safeName}'s Room`;
  title.textContent = possessive;
}

function syncRoomUserCard() {
  const card = document.getElementById('roomUserCard');
  const avatar = document.getElementById('roomUserAvatar');
  if (!card || !avatar) return;
  const uploadedAvatar = loadUploadedAvatarData();

  const user = MarginaliaAuth?.user || null;
  if (!user) {
    card.setAttribute('aria-label', 'Open Login Panel');
    avatar.textContent = 'R';
    if (uploadedAvatar) {
      avatar.style.backgroundImage = `url("${uploadedAvatar.replace(/"/g, '%22')}")`;
      avatar.classList.add('has-photo');
      avatar.textContent = '';
    } else {
      avatar.style.backgroundImage = '';
      avatar.classList.remove('has-photo');
    }
    return;
  }

  const rawName = String(user.displayName || user.email || 'User').trim();
  const userName = rawName.includes('@') ? rawName.split('@')[0] : rawName;
  card.setAttribute('aria-label', 'Open Account Panel');
  if (uploadedAvatar) {
    avatar.textContent = '';
    avatar.style.backgroundImage = `url("${uploadedAvatar.replace(/"/g, '%22')}")`;
    avatar.classList.add('has-photo');
  } else if (user.photoURL) {
    avatar.textContent = '';
    avatar.style.backgroundImage = `url("${user.photoURL.replace(/"/g, '%22')}")`;
    avatar.classList.add('has-photo');
  } else {
    avatar.textContent = String(userName || 'U').charAt(0).toUpperCase();
    avatar.style.backgroundImage = '';
    avatar.classList.remove('has-photo');
  }
}

function loadUploadedAvatarData() {
  try {
    return localStorage.getItem(ROOM_AVATAR_STORAGE_KEY) || '';
  } catch (error) {
    return '';
  }
}

function syncHoverBadge() {
  const badge = document.getElementById('roomHoverBadge');
  const icon = document.getElementById('roomHoverIcon');
  const title = document.getElementById('roomHoverTitle');
  const desc = document.getElementById('roomHoverDesc');
  const action = ROOM_VIEW_STATE.hoverAction;
  if (!badge || !icon || !title || !desc) return;

  if (!action) {
    badge.hidden = true;
    return;
  }

  const meta = HOVER_META_BY_ACTION[action];
  if (!meta) {
    badge.hidden = true;
    return;
  }

  icon.innerHTML = renderIcon(meta.icon);
  title.textContent = meta.title;
  desc.textContent = meta.description;

  const left = Math.min(Math.max(12, ROOM_VIEW_STATE.hoverPoint.x + 18), window.innerWidth - 250);
  const top = Math.min(Math.max(12, ROOM_VIEW_STATE.hoverPoint.y - 64), window.innerHeight - 96);
  badge.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  badge.hidden = false;
}

function applyAtmospherePreset(atmosphere) {
  if (!ROOM_VIEW_STATE.handle) return;
  if (atmosphere === 'morning') ROOM_VIEW_STATE.skinId = 'mist-morning';
  else if (atmosphere === 'night') ROOM_VIEW_STATE.skinId = 'night-lamp';
  else ROOM_VIEW_STATE.skinId = 'warm-study';
  ROOM_VIEW_STATE.handle.setSkin(ROOM_VIEW_STATE.skinId);
}

function openPanel(panelId, params = {}) {
  if (ROOM_VIEW_STATE.transitioning) return;
  ROOM_VIEW_STATE.transitioning = true;
  ROOM_VIEW_STATE.hoverAction = null;
  syncHoverBadge();
  const roomTransition = buildRoomTransitionMeta(panelId);
  const nextParams = { ...params, __roomTransition: roomTransition };
  PanelManager.primeTransition?.(roomTransition, panelId);

  const pose = PANEL_POSES[panelId];
  if (pose && ROOM_VIEW_STATE.handle) {
    ROOM_VIEW_STATE.pose = pose;
    ROOM_VIEW_STATE.handle.goToPose(pose, false);
    syncPoseButtons();
  }

  if (ROOM_VIEW_STATE.transitionTimer) {
    window.clearTimeout(ROOM_VIEW_STATE.transitionTimer);
  }

  const delay = PANEL_TRANSITION_MS[panelId] ?? 340;
  ROOM_VIEW_STATE.transitionTimer = window.setTimeout(() => {
    ROOM_VIEW_STATE.transitioning = false;
    ROOM_VIEW_STATE.transitionTimer = null;

    if (App?.navigateTo && HASH_ROUTED_PANELS.has(panelId)) {
      App.navigateTo(panelId, nextParams);
      return;
    }
    PanelManager.open(panelId, nextParams);
  }, delay);
}

function buildRoomTransitionMeta(panelId) {
  const origin = ROOM_TRANSITION_ORIGIN_MAP[panelId] || 'center';
  const [originX, originY] = ROOM_TRANSITION_COORD_MAP[origin] || ROOM_TRANSITION_COORD_MAP.center;
  return {
    source: 'room',
    origin,
    originX,
    originY,
  };
}

function exitRoomViaHeroFlip() {
  if (ROOM_VIEW_STATE.transitioning) return;
  ROOM_VIEW_STATE.transitioning = true;

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:9999;',
    'display:flex;align-items:center;justify-content:center;',
    'background:rgba(0,0,0,0);',
    'transition:background 0.6s ease;',
    'pointer-events:none;',
  ].join('');
  document.body.appendChild(overlay);

  const bookEl = document.createElement('div');
  bookEl.className = 'book hero-3d';
  bookEl.style.cssText = [
    '--spine-w:140px;--book-h:210px;--expand:260px;--hero-stage-clearance:0px;',
    'width:140px;height:210px;position:relative;',
    'visibility:hidden;',
  ].join('');
  const bookInner = document.createElement('div');
  bookInner.className = 'book-inner';
  bookEl.appendChild(bookInner);
  overlay.appendChild(bookEl);

  requestAnimationFrame(() => {
    overlay.style.background = 'rgba(0,0,0,0.78)';
  });

  import('/src/preloader/hero-glb.js').then(({ mountHeroGLB }) => {
    const teardown = mountHeroGLB(bookEl);

    const onPullComplete = () => {
      bookEl.style.visibility = 'visible';
      setTimeout(() => {
        bookEl.classList.add('opened');
      }, 80);
    };

    if (ROOM_VIEW_STATE.handle) {
      ROOM_VIEW_STATE.handle.animateHeroBookPull(onPullComplete, 600);
    } else {
      onPullComplete();
    }

    setTimeout(() => {
      overlay.style.transition = 'opacity 0.5s ease';
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (teardown) teardown();
        overlay.remove();
        ROOM_VIEW_STATE.transitioning = false;
        PanelManager.open('library', { source: 'room-hero-book', mode: 'organize' });
      }, 500);
    }, 1650);
  }).catch(() => {
    overlay.remove();
    ROOM_VIEW_STATE.transitioning = false;
    openPanel('library', { mode: 'organize' });
  });
}

export { initRoom, enterRoom, renderRoomTopTabs };
