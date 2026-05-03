import { RoomScene } from '../three/room.ts';
import { ROOM_SKINS } from '../three/skins.ts';

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

  // Keep wall slots unmounted for now.
  // Walls are real 3D structures; 2D components will be projected in later phases.

  // Desk slot is intentionally left empty at this stage.
  // We'll project the reading component in a later phase.

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
