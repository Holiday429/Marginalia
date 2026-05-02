export interface RoomSkin {
  id: string;
  label: string;
  colors: {
    background: string;
    floor: string;
    wall: string;
    sideWall: string;
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
      background: '#d4c2b0',
      floor: '#c8b39f',
      wall: '#d3beac',
      sideWall: '#c59f77',
      desk: '#9c734d',
      windowGlow: '#d8ecff',
    },
    lighting: { ambient: 0.7, key: 1.0, rim: 0.55 },
  },
  {
    id: 'mist-morning',
    label: 'Mist Morning',
    colors: {
      background: '#d8d7d0',
      floor: '#c5c0b5',
      wall: '#dcd9d1',
      sideWall: '#b8ac97',
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
      floor: '#44392e',
      wall: '#4f4135',
      sideWall: '#6a5038',
      desk: '#7b5f43',
      windowGlow: '#4f6a8a',
    },
    lighting: { ambient: 0.38, key: 0.74, rim: 0.7 },
  },
];

export function getRoomSkinById(skinId: string): RoomSkin {
  return ROOM_SKINS.find((skin) => skin.id === skinId) || ROOM_SKINS[0];
}
