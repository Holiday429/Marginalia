import { RoomScene } from '../three/room.ts';
import { ROOM_SKINS } from '../three/skins.ts';
import { createNotesWallComponent } from '../components/notes-wall/notes-wall.js';
import { createDeskSlotComponent } from '../components/reading-session/desk-slot.ts';
import { createShelfWallComponent } from '../library-2d/library-2d-slot.ts';

export function createThreeRoomPreview(host, options = {}) {
  if (!host) return null;

  const scene = new RoomScene({
    host,
    skinId: ROOM_SKINS[0]?.id || 'warm-study',
    onGlobeSelect: typeof options.onGlobeSelect === 'function' ? options.onGlobeSelect : undefined,
    onLaptopSelect: typeof options.onLaptopSelect === 'function' ? options.onLaptopSelect : undefined,
    onOrganizeSelect: typeof options.onOrganizeSelect === 'function' ? options.onOrganizeSelect : undefined,
    onSapiensSelect: typeof options.onSapiensSelect === 'function' ? options.onSapiensSelect : undefined,
    onHeroBookSelect: typeof options.onHeroBookSelect === 'function' ? options.onHeroBookSelect : undefined,
    onInteractiveHover: typeof options.onInteractiveHover === 'function' ? options.onInteractiveHover : undefined,
  });

  // Mount notes wall component
  scene.mountSlot('notesWall', createNotesWallComponent());

  // Mount desk slot — currently-reading book + session start/stop
  scene.mountSlot('desk', createDeskSlotComponent());

  // Mount shelf wall — condensed spine-card view on the north wall
  scene.mountSlot('shelfWall', createShelfWallComponent());

  return {
    goToPose(pose, immediate = false) {
      scene.goToPose(pose, immediate);
    },

    setSpeedPreset(preset) {
      scene.setCameraSpeedPreset(preset);
    },

    setSkin(skinId) {
      scene.applySkin(skinId);
    },

    replayIntro() {
      scene.replayIntro();
    },

    zoomIn() {
      scene.zoomCurrentPose(0.32);
    },

    zoomOut() {
      scene.zoomCurrentPose(-0.32);
    },

    resetZoom() {
      scene.resetCurrentPoseZoom();
    },

    setFreeLookEnabled(enabled) {
      scene.setFreeLookEnabled(Boolean(enabled));
    },

    isFreeLookEnabled() {
      return scene.isFreeLookEnabled();
    },

    animateHeroBookPull(onComplete, durationMs = 600) {
      scene.animateHeroBookPull(onComplete, durationMs);
    },

    getHeroBookScreenPos() {
      return scene.getHeroBookScreenPos();
    },

    pause() {
      scene.pause();
    },

    resume() {
      scene.resume();
    },

    destroy() {
      scene.destroy();
    },
  };
}
