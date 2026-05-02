export interface RoomSkin {
  id: string;
  label: string;
  colors: {
    background: string;
    floor: string;
    wall: string;
    sideWall: string;
    ceiling: string;
    desk: string;
    windowGlow: string;
  };
  lighting: {
    ambient: number;
    key: number;
    rim: number;
  };
}

export const ROOM_SKINS: RoomSkin[] = [
  {
    id: 'warm-study',
    label: 'Warm Study',
    colors: {
      background: '#d8ccb9',
      floor: '#b99572',
      wall: '#b9ad98',
      sideWall: '#b9ad98',
      ceiling: '#ece3d5',
      desk: '#9c734d',
      windowGlow: '#e6f0ff',
    },
    lighting: { ambient: 0.78, key: 1.04, rim: 0.5 },
  },
  {
    id: 'mist-morning',
    label: 'Mist Morning',
    colors: {
      background: '#d8d2c8',
      floor: '#b69b7e',
      wall: '#c6beb1',
      sideWall: '#c6beb1',
      ceiling: '#eeebe4',
      desk: '#8b7e6c',
      windowGlow: '#f2f6ff',
    },
    lighting: { ambient: 0.72, key: 0.92, rim: 0.44 },
  },
  {
    id: 'night-lamp',
    label: 'Night Lamp',
    colors: {
      background: '#2a2520',
      floor: '#5a4330',
      wall: '#4f4338',
      sideWall: '#4f4338',
      ceiling: '#7a6b5b',
      desk: '#7b5f43',
      windowGlow: '#4f6a8a',
    },
    lighting: { ambient: 0.38, key: 0.74, rim: 0.7 },
  },
];

export function getRoomSkinById(skinId: string): RoomSkin {
  return ROOM_SKINS.find((skin) => skin.id === skinId) || ROOM_SKINS[0];
}
