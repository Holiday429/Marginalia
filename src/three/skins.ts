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
    pendant: number;
    lamp: number;
    practicalGlow: number;
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
    lighting: { ambient: 0.78, key: 1.04, rim: 0.5, pendant: 0.22, lamp: 0.18, practicalGlow: 0.12 },
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
    lighting: { ambient: 0.72, key: 0.92, rim: 0.44, pendant: 0.16, lamp: 0.12, practicalGlow: 0.08 },
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
    lighting: { ambient: 0.38, key: 0.74, rim: 0.7, pendant: 1.1, lamp: 0.95, practicalGlow: 0.42 },
  },
  {
    id: 'amber-dusk',
    label: 'Amber Dusk',
    colors: {
      background: '#bda58f',
      floor: '#b18660',
      wall: '#b79f8b',
      sideWall: '#b79f8b',
      ceiling: '#e5d3c4',
      desk: '#9b6f4d',
      windowGlow: '#f3b17a',
    },
    lighting: { ambient: 0.58, key: 0.82, rim: 0.54, pendant: 0.62, lamp: 0.48, practicalGlow: 0.24 },
  },
];

export function getRoomSkinById(skinId: string): RoomSkin {
  return ROOM_SKINS.find((skin) => skin.id === skinId) || ROOM_SKINS[0];
}
