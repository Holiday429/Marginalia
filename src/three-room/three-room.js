import { RoomScene } from '../three/room.ts';
import { ROOM_SKINS } from '../three/skins.ts';

export function createThreeRoomPreview(host) {
  if (!host) return null;

  const scene = new RoomScene({ host, skinId: ROOM_SKINS[0]?.id || 'warm-study' });

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

    destroy() {
      scene.destroy();
    },
  };
}
