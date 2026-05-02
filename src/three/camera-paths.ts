export type RoomPoseId = 'front' | 'approach' | 'shelf' | 'notes';

export interface RoomPose {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  defaultDurationMs: number;
  idleAmplitude: {
    x: number;
    y: number;
  };
}

const POSES: Record<RoomPoseId, RoomPose> = {
  front: {
    position: [0, 1.9, 7.55],
    target: [0, 1.9, -1.45],
    fov: 52,
    defaultDurationMs: 900,
    idleAmplitude: { x: 0.012, y: 0.018 },
  },
  approach: {
    position: [0, 2.34, 1.92],
    target: [0, 1.12, -1.56],
    fov: 44,
    defaultDurationMs: 940,
    idleAmplitude: { x: 0.004, y: 0.006 },
  },
  shelf: {
    position: [0, 1.9, 0],
    target: [-5.22, 1.9, 0],
    fov: 58,
    defaultDurationMs: 820,
    idleAmplitude: { x: 0, y: 0 },
  },
  notes: {
    position: [0, 1.9, 0],
    target: [5.22, 1.9, 0],
    fov: 58,
    defaultDurationMs: 820,
    idleAmplitude: { x: 0, y: 0 },
  },
};

export function getRoomPose(poseId: RoomPoseId): RoomPose {
  return POSES[poseId] || POSES.front;
}

export function listRoomPoses(): RoomPoseId[] {
  return ['front', 'approach', 'shelf', 'notes'];
}
