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
// Palette: 0=transparent, 1=skin, 2=hair, 3=clothing(accent), 4=book, 5=shadow, 6=outline
const _ = 0, S = 1, H = 2, C = 3, B = 4, D = 5, K = 6;
// T = luggage body (reuses shadow slot for warm tan), W = wheel (dark)
const T = 5, W = 6;

// ── Idle frames (standing, holding book upright, slight bob) ─────────────
const IDLE_0: number[] = [
  _,_,_,_,_,K,K,K,K,K,K,_,_,_,_,_,
  _,_,_,_,K,H,H,H,H,H,H,K,_,_,_,_,
  _,_,_,_,K,S,S,S,S,S,S,K,_,_,_,_,
  _,_,_,_,K,S,S,S,S,S,S,K,_,_,_,_,
  _,_,_,K,K,H,H,H,H,H,H,K,K,_,_,_,
  _,_,_,K,C,C,C,C,C,C,C,C,K,_,_,_,
  _,_,_,K,C,C,C,C,C,C,C,C,K,_,_,_,
  _,_,_,K,C,C,C,C,C,C,C,C,K,_,_,_,
  _,_,K,C,C,C,C,C,C,C,C,C,C,K,_,_,
  _,_,K,S,B,B,B,B,B,B,B,B,S,K,_,_,
  _,_,K,S,B,B,B,B,B,B,B,B,S,K,_,_,
  _,_,_,K,S,K,_,_,_,_,K,S,K,_,_,_,
  _,_,K,C,C,K,_,_,_,_,K,C,C,K,_,_,
  _,_,K,C,C,K,_,_,_,_,K,C,C,K,_,_,
  _,_,K,S,S,K,_,_,_,_,K,S,S,K,_,_,
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
];

// Idle frame 1 — slight downward shift (bob)
const IDLE_1: number[] = [
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
  _,_,_,_,_,K,K,K,K,K,K,_,_,_,_,_,
  _,_,_,_,K,H,H,H,H,H,H,K,_,_,_,_,
  _,_,_,_,K,S,S,S,S,S,S,K,_,_,_,_,
  _,_,_,_,K,S,S,S,S,S,S,K,_,_,_,_,
  _,_,_,K,K,H,H,H,H,H,H,K,K,_,_,_,
  _,_,_,K,C,C,C,C,C,C,C,C,K,_,_,_,
  _,_,_,K,C,C,C,C,C,C,C,C,K,_,_,_,
  _,_,K,C,C,C,C,C,C,C,C,C,C,K,_,_,
  _,_,K,S,B,B,B,B,B,B,B,B,S,K,_,_,
  _,_,K,S,B,B,B,B,B,B,B,B,S,K,_,_,
  _,_,_,K,S,K,_,_,_,_,K,S,K,_,_,_,
  _,_,K,C,C,K,_,_,_,_,K,C,C,K,_,_,
  _,_,K,C,C,K,_,_,_,_,K,C,C,K,_,_,
  _,_,K,S,S,K,_,_,_,_,K,S,S,K,_,_,
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
];

// ── Travel frames (standing + rolling suitcase) ───────────────────────────
// Figure leans slightly; suitcase trails on the right with handle + wheels
const WALK_0: number[] = [
  _,_,_,_,_,K,K,K,K,K,K,_,_,_,_,_,
  _,_,_,_,K,H,H,H,H,H,H,K,_,_,_,_,
  _,_,_,_,K,S,S,S,S,S,S,K,_,_,_,_,
  _,_,_,_,K,S,S,S,S,S,S,K,_,_,_,_,
  _,_,_,K,K,H,H,H,H,H,H,K,K,_,_,_,
  _,_,_,K,C,C,C,C,C,C,C,C,K,_,_,_,
  _,_,_,K,C,C,C,C,C,C,C,C,K,K,T,_,_,  // arm extends to bag handle
  _,_,_,K,C,C,C,C,C,C,C,K,K,T,T,T,_,  // suitcase top row
  _,_,_,K,C,C,C,C,C,C,K,T,T,T,T,T,_,  // suitcase body row 1
  _,_,_,K,S,S,K,_,_,K,T,T,T,T,T,T,_,  // suitcase body row 2
  _,_,_,K,S,S,K,_,_,K,T,T,T,T,T,T,_,  // suitcase body row 3
  _,_,_,K,S,S,K,_,_,K,K,K,K,K,K,K,_,  // suitcase bottom edge
  _,_,K,C,C,K,_,_,_,_,_,_,_,_,_,_,
  _,_,K,C,C,K,_,_,_,_,W,_,_,_,W,_,  // wheels
  _,_,K,S,S,K,_,_,_,_,_,_,_,_,_,_,
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
];

// Frame 1 — slight weight shift (figure same, suitcase wheels roll)
const WALK_1: number[] = [
  _,_,_,_,_,K,K,K,K,K,K,_,_,_,_,_,
  _,_,_,_,K,H,H,H,H,H,H,K,_,_,_,_,
  _,_,_,_,K,S,S,S,S,S,S,K,_,_,_,_,
  _,_,_,_,K,S,S,S,S,S,S,K,_,_,_,_,
  _,_,_,K,K,H,H,H,H,H,H,K,K,_,_,_,
  _,_,_,K,C,C,C,C,C,C,C,C,K,_,_,_,
  _,_,_,K,C,C,C,C,C,C,C,C,K,K,T,_,_,
  _,_,_,K,C,C,C,C,C,C,C,K,K,T,T,T,_,
  _,_,_,K,C,C,C,C,C,C,K,T,T,T,T,T,_,
  _,_,_,K,S,S,K,_,_,K,T,T,T,T,T,T,_,
  _,_,_,K,S,S,K,_,_,K,T,T,T,T,T,T,_,
  _,_,_,K,S,S,K,_,_,K,K,K,K,K,K,K,_,
  _,_,K,C,C,K,_,_,_,_,_,_,_,_,_,_,
  _,_,K,C,C,K,_,_,_,_,_,W,_,W,_,_,  // wheels offset
  _,_,K,S,S,K,_,_,_,_,_,_,_,_,_,_,
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
];

// ── Read (seated) frames ──────────────────────────────────────────────────
const READ_0: number[] = [
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
  _,_,_,_,K,K,K,K,K,K,K,_,_,_,_,_,
  _,_,_,_,K,H,H,H,H,H,H,K,_,_,_,_,
  _,_,_,_,K,S,S,S,S,S,S,K,_,_,_,_,
  _,_,_,_,K,S,S,S,S,S,S,K,_,_,_,_,
  _,_,_,K,K,H,H,H,H,H,H,K,K,_,_,_,
  _,_,_,K,C,C,C,C,C,C,C,C,K,_,_,_,
  _,_,K,S,B,B,B,B,B,B,B,B,S,K,_,_,
  _,_,K,S,B,B,B,B,B,B,B,B,S,K,_,_,
  _,_,K,S,B,B,B,B,B,B,B,B,S,K,_,_,
  _,_,_,K,C,C,C,C,C,C,C,C,K,_,_,_,
  _,_,_,K,C,K,_,K,C,K,_,K,C,K,_,_,
  _,_,_,K,S,K,_,K,S,K,_,K,S,K,_,_,
  _,_,_,K,S,K,_,K,S,K,_,K,S,K,_,_,
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
];

const READ_1: number[] = [
  _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,
  _,_,_,_,K,K,K,K,K,K,K,_,_,_,_,_,
  _,_,_,_,K,H,H,H,H,H,H,K,_,_,_,_,
  _,_,_,_,K,S,S,S,S,S,S,K,_,_,_,_,
  _,_,_,_,K,S,S,S,S,S,S,K,_,_,_,_,
  _,_,_,K,K,H,H,H,H,H,H,K,K,_,_,_,
  _,_,_,K,C,C,C,C,C,C,C,C,K,_,_,_,
  _,_,K,S,B,B,B,B,B,B,B,B,S,K,_,_,
  _,_,K,S,B,B,B,B,B,B,B,B,S,K,_,_,
  _,K,S,S,B,B,B,B,B,B,B,B,S,S,K,_,  // wider open book
  _,_,_,K,C,C,C,C,C,C,C,C,K,_,_,_,
  _,_,_,K,C,K,_,K,C,K,_,K,C,K,_,_,
  _,_,_,K,S,K,_,K,S,K,_,K,S,K,_,_,
  _,_,_,K,S,K,_,K,S,K,_,K,S,K,_,_,
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
    2: [40,  28,  18,255], // hair
    3: [ar,  ag,  ab,255], // clothing = accent
    4: [232,223,200,255],  // book pages
    5: [140,110, 75,255],  // luggage body (warm tan)
    6: [22,  15,   8,255], // outline / wheels (near-black)
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
