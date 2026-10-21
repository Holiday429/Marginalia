// The room's look is two independent axes (docs/phase-3-plan.md, stage 4):
//   Atmosphere = time of day: light levels, light colour, the window and the sky behind it.
//   Theme      = material: the colour of the walls, floor, desk, ceiling and rug.
// What you see is the theme's materials lit by the atmosphere. Neither table knows about the other.

export interface RoomAtmosphere {
  id: string;
  label: string;
  colors: {
    background: string;
    windowGlow: string;
  };
  /** How dark the surfaces without a texture (ceiling, wall panels) read at this time of day; a linear-light multiplier. */
  shade: number;
  lighting: {
    ambient: number;
    key: number;
    rim: number;
    pendant: number;
    lamp: number;
    practicalGlow: number;
  };
}

export const ROOM_ATMOSPHERES: RoomAtmosphere[] = [
  {
    id: 'warm-study',
    label: 'Afternoon',
    colors: { background: '#d8ccb9', windowGlow: '#e6f0ff' },
    shade: 1,
    lighting: { ambient: 0.78, key: 1.04, rim: 0.5, pendant: 0.22, lamp: 0.18, practicalGlow: 0.12 },
  },
  {
    id: 'mist-morning',
    label: 'Morning',
    colors: { background: '#d8d2c8', windowGlow: '#f2f6ff' },
    shade: 1.1,
    lighting: { ambient: 0.72, key: 0.92, rim: 0.44, pendant: 0.16, lamp: 0.12, practicalGlow: 0.08 },
  },
  {
    id: 'night-lamp',
    label: 'Night',
    colors: { background: '#2a2520', windowGlow: '#4f6a8a' },
    shade: 0.18,
    lighting: { ambient: 0.38, key: 0.74, rim: 0.7, pendant: 1.1, lamp: 0.95, practicalGlow: 0.42 },
  },
  {
    id: 'amber-dusk',
    label: 'Dusk',
    colors: { background: '#bda58f', windowGlow: '#f3b17a' },
    shade: 0.88,
    lighting: { ambient: 0.58, key: 0.82, rim: 0.54, pendant: 0.62, lamp: 0.48, practicalGlow: 0.24 },
  },
];

export function getRoomAtmosphereById(atmosphereId: string): RoomAtmosphere {
  return ROOM_ATMOSPHERES.find((a) => a.id === atmosphereId) || ROOM_ATMOSPHERES[0];
}

/** The colour each surface looks like under neutral light. Textured surfaces are tinted by this colour divided by
 *  the taupe one, so taupe leaves the textures exactly as they are and the others shift them towards their colour. */
export interface RoomTheme {
  id: string;
  label: string;
  colors: {
    wall: string;
    sideWall: string;
    ceiling: string;
    floor: string;
    desk: string;
    /** Tint applied to the textured rug (taupe keeps the value the room always used). */
    carpet: string;
    /** The rug before its texture has loaded. */
    carpetBare: string;
  };
}

// The five themes are the same palettes as the landing page (--theme-<name>-* in src/core/base.css); the wall and side wall
// follow that palette's background and deeper background, the other surfaces are chosen to sit with them.
export const ROOM_THEMES: RoomTheme[] = [
  {
    id: 'taupe',
    label: 'Taupe',
    colors: { wall: '#b9ad98', sideWall: '#b9ad98', ceiling: '#ece3d5', floor: '#b99572', desk: '#9c734d', carpet: '#cbbba6', carpetBare: '#ad9b88' },
  },
  {
    id: 'ink',
    label: 'Ink',
    colors: { wall: '#6b645c', sideWall: '#5a544d', ceiling: '#4a443e', floor: '#6a5240', desk: '#5e4733', carpet: '#8d8071', carpetBare: '#6f6559' },
  },
  {
    id: 'cream',
    label: 'Cream',
    colors: { wall: '#d8cdb9', sideWall: '#cdc1ab', ceiling: '#f4eee2', floor: '#d4b690', desk: '#b78d62', carpet: '#e0d4c0', carpetBare: '#cdbfa8' },
  },
  {
    id: 'sage',
    label: 'Sage',
    colors: { wall: '#a9b39a', sideWall: '#98a38a', ceiling: '#e3e7da', floor: '#a89877', desk: '#8a7957', carpet: '#b4bda5', carpetBare: '#97a089' },
  },
  {
    id: 'clay',
    label: 'Clay',
    colors: { wall: '#c79f87', sideWall: '#b78f78', ceiling: '#eddcce', floor: '#b5805c', desk: '#9f6340', carpet: '#d4b29b', carpetBare: '#b99580' },
  },
];

export const DEFAULT_ROOM_THEME_ID = 'taupe';

export function getRoomThemeById(themeId: string): RoomTheme {
  return ROOM_THEMES.find((t) => t.id === themeId) || ROOM_THEMES[0];
}
