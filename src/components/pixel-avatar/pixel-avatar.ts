/* Marginalia · Pixel Avatar
   16×16 canvas sprite — 3 states: idle (reads), walk, read (seated).
   Drawn entirely in code; no external assets.
   accentColor drives the clothing; matches current book spine color.
*/

export type AvatarState = 'idle' | 'walk' | 'read';

interface AvatarOptions {
  state?: AvatarState;
  accentColor?: string;  // CSS color string — defaults to --color-accent-gold
  scale?: number;        // pixel scale multiplier (default 3 → 48×48 px rendered)
}

// Each frame is a 16×16 flat array of palette indices (0 = transparent).
// Palette: 0=transparent, 1=skin, 2=hair, 3=clothing(accent), 4=book, 5=shadow, 6=dark
const _ = 0, S = 1, H = 2, C = 3, B = 4, D = 5, K = 6;

// ── Idle frames (holding book, slight bob) ────────────────────────────────
const IDLE_0: number[] = [
  _,_,_,_,_,_,H,H,H,H,_,_,_,_,_,_,
  _,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_,
  _,_,_,_,_,S,S,S,S,S,S,_,_,_,_,_,
  _,_,_,_,_,S,S,S,S,S,S,_,_,_,_,_,
  _,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_,
  _,_,_,_,C,C,C,C,C,C,C,C,_,_,_,_,
  _,_,_,_,C,C,C,C,C,C,C,C,_,_,_,_,
  _,_,_,_,C,C,C,C,C,C,C,C,_,_,_,_,
  _,_,_,C,C,C,C,C,C,C,C,C,C,_,_,_,
  _,_,_,S,B,B,B,B,B,B,B,B,S,_,_,_,
  _,_,_,S,B,B,B,B,B,B,B,B,S,_,_,_,
  _,_,_,S,S,_,_,_,_,_,_,S,S,_,_,_,
  _,_,C,C,_,_,_,_,_,_,_,_,C,C,_,_,
  _,_,C,C,_,_,_,_,_,_,_,_,C,C,_,_,
  _,_,S,S,_,_,_,_,_,_,_,_,S,S,_,_,
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
];

// Idle frame 1 — slight downward shift (bob)
const IDLE_1: number[] = [
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
  _,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_,
  _,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_,
  _,_,_,_,_,S,S,S,S,S,S,_,_,_,_,_,
  _,_,_,_,_,S,S,S,S,S,S,_,_,_,_,_,
  _,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_,
  _,_,_,_,C,C,C,C,C,C,C,C,_,_,_,_,
  _,_,_,_,C,C,C,C,C,C,C,C,_,_,_,_,
  _,_,_,C,C,C,C,C,C,C,C,C,C,_,_,_,
  _,_,_,S,B,B,B,B,B,B,B,B,S,_,_,_,
  _,_,_,S,B,B,B,B,B,B,B,B,S,_,_,_,
  _,_,_,S,S,_,_,_,_,_,_,S,S,_,_,_,
  _,_,C,C,_,_,_,_,_,_,_,_,C,C,_,_,
  _,_,C,C,_,_,_,_,_,_,_,_,C,C,_,_,
  _,_,S,S,_,_,_,_,_,_,_,_,S,S,_,_,
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
];

// ── Walk frames ───────────────────────────────────────────────────────────
const WALK_0: number[] = [
  _,_,_,_,_,_,H,H,H,H,_,_,_,_,_,_,
  _,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_,
  _,_,_,_,_,S,S,S,S,S,S,_,_,_,_,_,
  _,_,_,_,_,S,S,S,S,S,S,_,_,_,_,_,
  _,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_,
  _,_,_,_,C,C,C,C,C,C,C,C,_,_,_,_,
  _,_,_,_,C,C,C,C,C,C,C,C,_,_,_,_,
  _,_,_,_,C,C,C,C,C,C,C,C,_,_,_,_,
  _,_,_,_,C,C,C,C,C,C,C,C,_,_,_,_,
  _,_,_,C,S,S,_,_,_,_,S,S,C,_,_,_,
  _,_,C,S,_,_,_,_,_,_,_,_,S,C,_,_,
  _,_,C,S,_,_,_,_,_,_,_,_,S,C,_,_,
  _,_,_,C,C,_,_,_,_,_,C,C,_,_,_,_,
  _,_,_,S,S,_,_,_,_,_,S,S,_,_,_,_,
  _,_,_,S,_,_,_,_,_,_,_,S,_,_,_,_,
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
];

const WALK_1: number[] = [
  _,_,_,_,_,_,H,H,H,H,_,_,_,_,_,_,
  _,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_,
  _,_,_,_,_,S,S,S,S,S,S,_,_,_,_,_,
  _,_,_,_,_,S,S,S,S,S,S,_,_,_,_,_,
  _,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_,
  _,_,_,_,C,C,C,C,C,C,C,C,_,_,_,_,
  _,_,_,_,C,C,C,C,C,C,C,C,_,_,_,_,
  _,_,_,_,C,C,C,C,C,C,C,C,_,_,_,_,
  _,_,_,_,C,C,C,C,C,C,C,C,_,_,_,_,
  _,_,_,C,S,S,_,_,_,_,S,S,C,_,_,_,
  _,C,S,_,_,_,_,_,_,_,_,_,_,S,C,_,
  _,C,S,_,_,_,_,_,_,_,_,_,_,S,C,_,
  _,_,C,C,_,_,_,_,_,_,_,_,C,C,_,_,
  _,_,_,S,S,_,_,_,_,_,S,S,_,_,_,_,
  _,_,_,_,S,_,_,_,_,_,S,_,_,_,_,_,
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
];

// ── Read (seated) frames ──────────────────────────────────────────────────
const READ_0: number[] = [
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
  _,_,_,_,_,_,H,H,H,H,_,_,_,_,_,_,
  _,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_,
  _,_,_,_,_,S,S,S,S,S,S,_,_,_,_,_,
  _,_,_,_,_,S,S,S,S,S,S,_,_,_,_,_,
  _,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_,
  _,_,_,_,C,C,C,C,C,C,C,C,_,_,_,_,
  _,_,_,S,B,B,B,B,B,B,B,B,S,_,_,_,
  _,_,_,S,B,B,B,B,B,B,B,B,S,_,_,_,
  _,_,_,S,B,B,B,B,B,B,B,B,S,_,_,_,
  _,_,_,C,C,C,C,C,C,C,C,C,C,_,_,_,
  _,_,_,C,C,_,_,C,C,_,_,C,C,_,_,_,
  _,_,_,S,S,_,_,S,S,_,_,S,S,_,_,_,
  _,_,_,S,S,_,_,S,S,_,_,S,S,_,_,_,
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
];

const READ_1: number[] = [
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
  _,_,_,_,_,_,H,H,H,H,_,_,_,_,_,_,
  _,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_,
  _,_,_,_,_,S,S,S,S,S,S,_,_,_,_,_,
  _,_,_,_,_,S,S,S,S,S,S,_,_,_,_,_,
  _,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_,
  _,_,_,_,C,C,C,C,C,C,C,C,_,_,_,_,
  _,_,_,S,B,B,B,B,B,B,B,B,S,_,_,_,
  _,_,_,S,B,B,B,B,B,B,B,B,S,_,_,_,
  _,_,S,S,B,B,B,B,B,B,B,B,S,S,_,_,  // wider open book
  _,_,_,C,C,C,C,C,C,C,C,C,C,_,_,_,
  _,_,_,C,C,_,_,C,C,_,_,C,C,_,_,_,
  _,_,_,S,S,_,_,S,S,_,_,S,S,_,_,_,
  _,_,_,S,S,_,_,S,S,_,_,S,S,_,_,_,
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
];

const FRAMES: Record<AvatarState, number[][]> = {
  idle: [IDLE_0, IDLE_1],
  walk: [WALK_0, WALK_1],
  read: [READ_0, READ_1],
};

const FRAME_MS: Record<AvatarState, number> = {
  idle: 800,
  walk: 280,
  read: 1200,
};

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  if (c.length === 3) {
    return [parseInt(c[0]+c[0],16), parseInt(c[1]+c[1],16), parseInt(c[2]+c[2],16)];
  }
  return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)];
}

// Convert any CSS color to rgb by rendering through an offscreen canvas
function cssColorToRgb(color: string): [number, number, number] {
  try {
    const offscreen = document.createElement('canvas');
    offscreen.width = 1; offscreen.height = 1;
    const ctx = offscreen.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0,0,1,1);
    const [r,g,b] = ctx.getImageData(0,0,1,1).data;
    return [r,g,b];
  } catch {
    return hexToRgb('#c49a52');
  }
}

function buildPalette(accentColor: string): Record<number, [number,number,number,number]> {
  const [ar,ag,ab] = cssColorToRgb(accentColor);
  return {
    1: [210,175,140,255],  // skin
    2: [40, 28, 18, 255],  // hair / dark
    3: [ar, ag, ab, 255],  // clothing = accent
    4: [232,223,200,255],  // book pages
    5: [60, 45, 30, 200],  // shadow
    6: [30, 22, 14, 255],  // very dark
  };
}

export class PixelAvatar {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: AvatarState;
  private palette: ReturnType<typeof buildPalette>;
  private frameIdx = 0;
  private rafId = 0;
  private lastTick = 0;
  private scale: number;

  constructor(options: AvatarOptions = {}) {
    this.state   = options.state ?? 'idle';
    this.scale   = options.scale ?? 3;
    this.palette = buildPalette(options.accentColor ?? '#c49a52');

    this.canvas = document.createElement('canvas');
    this.canvas.width  = 16 * this.scale;
    this.canvas.height = 16 * this.scale;
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d')!;
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.canvas);
    this._tick(0);
  }

  unmount(): void {
    cancelAnimationFrame(this.rafId);
    this.canvas.remove();
  }

  setState(state: AvatarState): void {
    if (this.state === state) return;
    this.state = state;
    this.frameIdx = 0;
    this.lastTick = 0;
  }

  setAccentColor(color: string): void {
    this.palette = buildPalette(color);
    this._draw();
  }

  get element(): HTMLCanvasElement {
    return this.canvas;
  }

  private _tick = (ts: number): void => {
    const interval = FRAME_MS[this.state];
    if (ts - this.lastTick >= interval) {
      this.lastTick = ts;
      this.frameIdx = (this.frameIdx + 1) % FRAMES[this.state].length;
      this._draw();
    }
    this.rafId = requestAnimationFrame(this._tick);
  };

  private _draw(): void {
    const frame = FRAMES[this.state][this.frameIdx];
    const { ctx, scale } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (let i = 0; i < 256; i++) {
      const px = frame[i];
      if (!px) continue;
      const rgba = this.palette[px];
      if (!rgba) continue;
      ctx.fillStyle = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]/255})`;
      const x = (i % 16) * scale;
      const y = Math.floor(i / 16) * scale;
      ctx.fillRect(x, y, scale, scale);
    }
  }
}
