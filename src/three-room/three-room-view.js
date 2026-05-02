import { createThreeRoomPreview } from './three-room.js';

const ROOM_VIEW_STATE = {
  pose: 'front',
  skinId: 'warm-study',
  speedPreset: 'default',
  handle: null,
  bound: false,
};

function buildRoomMarkup() {
  return `
    <div class="room-experience" data-room-experience>
      <div class="room-experience-header">
        ${typeof window.renderPrimaryHeader === 'function'
          ? window.renderPrimaryHeader('studio', { actionLabel: 'Open Organize', actionId: 'roomOpenOrganizeBtn' })
          : ''
        }
      </div>

      <main class="room-experience-main">
        <section class="room-experience-stage-wrap" aria-label="3D room preview">
          <div class="room-experience-stage" id="roomExperienceStage"></div>
        </section>

        <section class="room-experience-controls" id="roomExperienceControls" aria-label="3D room controls">
          <div class="room-control-group room-control-group-views" aria-label="Camera view">
            <span class="room-controls-label">3D Room</span>
            <button type="button" class="room-control-btn active" data-room-pose="front">Front</button>
            <button type="button" class="room-control-btn" data-room-pose="approach">Desk</button>
            <button type="button" class="room-control-btn" data-room-pose="shelf">Shelf Wall</button>
            <button type="button" class="room-control-btn" data-room-pose="notes">Notes Wall</button>
          </div>

          <div class="room-control-group" aria-label="Library projections">
            <span class="room-controls-label">Library Layers</span>
            <button type="button" class="room-control-btn" data-room-layer="search">Search</button>
            <button type="button" class="room-control-btn" data-room-layer="organize">Organize</button>
          </div>

          <div class="room-control-group" aria-label="Camera controls">
            <select class="room-control-select" id="roomSpeedSelect" aria-label="Camera speed">
              <option value="default">Speed: Default</option>
              <option value="quick">Speed: Quick</option>
            </select>
            <button type="button" class="room-control-btn" id="roomZoomInBtn">Zoom In</button>
            <button type="button" class="room-control-btn" id="roomZoomOutBtn">Zoom Out</button>
            <button type="button" class="room-control-btn" id="roomZoomResetBtn">Reset Zoom</button>
          </div>

          <div class="room-control-group" aria-label="Room options">
            <select class="room-control-select" id="roomSkinSelect" aria-label="Room skin">
              <option value="warm-study">Warm Study</option>
              <option value="mist-morning">Mist Morning</option>
              <option value="night-lamp">Night Lamp</option>
            </select>
            <button type="button" class="room-control-btn" id="roomReplayBtn">Replay Intro</button>
          </div>
        </section>
      </main>
    </div>
  `;
}

function initRoom() {
  const host = document.getElementById('view-room');
  if (!host) return;
  if (ROOM_VIEW_STATE.handle) {
    ROOM_VIEW_STATE.handle.destroy();
    ROOM_VIEW_STATE.handle = null;
  }
  host.innerHTML = buildRoomMarkup();
  bindRoomEvents();
  mountRoomScene();
  syncRoomControls();
}

function enterRoom() {
  ensureRoomDom();
  mountRoomScene();
  syncRoomControls();
}

function ensureRoomDom() {
  const root = document.getElementById('view-room');
  if (!root) return;
  if (root.querySelector('[data-room-experience]') && root.querySelector('#roomExperienceStage') && root.querySelector('#roomExperienceControls')) return;
  if (ROOM_VIEW_STATE.handle) {
    ROOM_VIEW_STATE.handle.destroy();
    ROOM_VIEW_STATE.handle = null;
  }
  root.innerHTML = buildRoomMarkup();
}

function bindRoomEvents() {
  if (ROOM_VIEW_STATE.bound) return;
  ROOM_VIEW_STATE.bound = true;

  const root = document.getElementById('view-room');
  if (!root) return;

  root.addEventListener('click', (event) => {
    if (event.target.closest('#roomOpenOrganizeBtn')) {
      App.show('studio', { source: 'room', mode: 'organize' });
      return;
    }

    if (event.target.closest('#roomReplayBtn')) {
      ROOM_VIEW_STATE.pose = 'front';
      syncRoomPoseButtons();
      if (ROOM_VIEW_STATE.handle) ROOM_VIEW_STATE.handle.replayIntro();
      return;
    }

    if (event.target.closest('#roomZoomInBtn')) {
      if (ROOM_VIEW_STATE.handle) ROOM_VIEW_STATE.handle.zoomIn();
      return;
    }

    if (event.target.closest('#roomZoomOutBtn')) {
      if (ROOM_VIEW_STATE.handle) ROOM_VIEW_STATE.handle.zoomOut();
      return;
    }

    if (event.target.closest('#roomZoomResetBtn')) {
      if (ROOM_VIEW_STATE.handle) ROOM_VIEW_STATE.handle.resetZoom();
      return;
    }

    const layerBtn = event.target.closest('[data-room-layer]');
    if (layerBtn) {
      const mode = layerBtn.dataset.roomLayer === 'search' ? 'search' : 'organize';
      App.show('studio', { source: 'room', mode });
      return;
    }

    const poseBtn = event.target.closest('[data-room-pose]');
    if (!poseBtn) return;
    applyRoomPose(poseBtn.dataset.roomPose || 'front');
  });

  root.addEventListener('change', (event) => {
    const speedSelect = event.target.closest('#roomSpeedSelect');
    if (speedSelect) {
      ROOM_VIEW_STATE.speedPreset = speedSelect.value === 'quick' ? 'quick' : 'default';
      if (ROOM_VIEW_STATE.handle) ROOM_VIEW_STATE.handle.setSpeedPreset(ROOM_VIEW_STATE.speedPreset);
      return;
    }

    const skinSelect = event.target.closest('#roomSkinSelect');
    if (skinSelect) {
      ROOM_VIEW_STATE.skinId = skinSelect.value || 'warm-study';
      if (ROOM_VIEW_STATE.handle) ROOM_VIEW_STATE.handle.setSkin(ROOM_VIEW_STATE.skinId);
    }
  });

  window.addEventListener('marginalia:ui-refresh', () => {
    if (document.body.dataset.view === 'room') return;
    if (!ROOM_VIEW_STATE.handle) return;
    ROOM_VIEW_STATE.handle.destroy();
    ROOM_VIEW_STATE.handle = null;
  });
}

function mountRoomScene() {
  const stage = document.getElementById('roomExperienceStage');
  if (!stage) return;

  if (!ROOM_VIEW_STATE.handle) {
    ROOM_VIEW_STATE.handle = createThreeRoomPreview(stage);
  }

  ROOM_VIEW_STATE.handle.setSpeedPreset(ROOM_VIEW_STATE.speedPreset);
  ROOM_VIEW_STATE.handle.setSkin(ROOM_VIEW_STATE.skinId);
  ROOM_VIEW_STATE.handle.goToPose(ROOM_VIEW_STATE.pose, true);
}

function applyRoomPose(pose) {
  const normalized = pose === 'approach' || pose === 'shelf' || pose === 'notes' ? pose : 'front';
  ROOM_VIEW_STATE.pose = normalized;
  syncRoomPoseButtons();
  if (!ROOM_VIEW_STATE.handle) return;
  ROOM_VIEW_STATE.handle.goToPose(normalized, false);
}

function syncRoomControls() {
  const speedSelect = document.getElementById('roomSpeedSelect');
  if (speedSelect) speedSelect.value = ROOM_VIEW_STATE.speedPreset;

  const skinSelect = document.getElementById('roomSkinSelect');
  if (skinSelect) skinSelect.value = ROOM_VIEW_STATE.skinId;

  syncRoomPoseButtons();
}

function syncRoomPoseButtons() {
  const root = document.getElementById('view-room');
  if (!root) return;
  root.querySelectorAll('[data-room-pose]').forEach((node) => {
    node.classList.toggle('active', node.dataset.roomPose === ROOM_VIEW_STATE.pose);
  });
}

window.initRoom = initRoom;
window.enterRoom = enterRoom;
