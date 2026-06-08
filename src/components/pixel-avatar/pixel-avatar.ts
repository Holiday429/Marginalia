import './pixel-reader.css';

export type PixelReaderState = 'idle' | 'traveling' | 'reading';
export type PixelReaderDirection = 'left' | 'right';
export type PixelReaderSize = 'sm' | 'md' | 'lg';

export interface PixelReaderOptions {
  state?: PixelReaderState;
  direction?: PixelReaderDirection;
  size?: PixelReaderSize;
  className?: string;
  accentColor?: string;
}

type RGBA = [number, number, number, number];

const FRAME_W = 48;
const FRAME_H = 48;

const FRAME_INTERVAL: Record<PixelReaderState, number> = {
  idle: 900,
  traveling: 260,
  reading: 1100,
};

const SIZE_SCALE: Record<PixelReaderSize, number> = {
  sm: 1,
  md: 2,
  lg: 3,
};

function row(pattern = ''): string {
  return pattern.padEnd(FRAME_W, '.').slice(0, FRAME_W);
}

// ---------------------------------------------------------------------------
// Pixel art character — dark messy hair, scarf, long coat, satchel bag
// Each frame is exactly FRAME_H (48) rows of exactly FRAME_W (48) chars
//
// Token key:
//   k = outline/dark edge
//   H = hair highlight     h = hair mid      m = hair dark
//   S = skin light         s = skin          u = skin shadow
//   e = eye
//   G = scarf light        g = scarf
//   C = coat light         c = coat          D = coat dark shadow
//   P = pants light        p = pants
//   B = boot light         b = boot
//   O = book page          o = book cover
//   T = bag light          t = bag           W = bag strap
// ---------------------------------------------------------------------------

const IDLE_A = [
  //         1111111111222222222233333333334444444444
  // 1234567890123456789012345678901234567890123456789
  row('................................................'), // 0
  row('................................................'), // 1
  row('................................................'), // 2
  row('................kkkkkk..........................'), // 3  hair top
  row('...............kHhhmmmkk........................'), // 4  hair
  row('..............kHhhmmmmmhk.......................'), // 5  hair
  row('..............khhmmmmmmmhk......................'), // 6  hair side
  row('..............khmsskssmhhk......................'), // 7  face + ear
  row('..............khmsseussmhk......................'), // 8  face eye
  row('..............khmsssssmmhk......................'), // 9  face
  row('...............khhmssmhhk.......................'), // 10 chin
  row('................kGGGGGGk........................'), // 11 scarf top
  row('...............kGGgggGGGk.......................'), // 12 scarf
  row('..............kCCccccCCCk.......................'), // 13 collar/coat top
  row('..............kCcccccccck.......................'), // 14 coat upper
  row('..............kcccccccDDk.......................'), // 15 coat
  row('..............kccccccDDDk.......................'), // 16 coat
  row('.............kCcccpppcDDk.......................'), // 17 coat + belt hint
  row('.............kccppppppcck.......................'), // 18 coat lower
  row('.............kccppppppppk.......................'), // 19
  row('.............kcppppppppck.......................'), // 20
  row('.............kccppppppcck.......................'), // 21
  row('.............kDDcppppcDDk.......................'), // 22 coat hem
  row('..............kppppppppk........................'), // 23 legs
  row('..............kpppppppk.........................'), // 24
  row('..............kppkkkppk.........................'), // 25 knee gap
  row('..............kppk.kppk.........................'), // 26
  row('..............kppk.kppk.........................'), // 27
  row('..............kbpk.kbbk.........................'), // 28 boot top
  row('..............kbbk.kbbk.........................'), // 29
  row('...............kkk..kkk.........................'), // 30 boot bottom
  row('................................................'), // 31
  row('................................................'), // 32
  row('................................................'), // 33
  row('................................................'), // 34
  row('................................................'), // 35
  row('................................................'), // 36
  row('................................................'), // 37
  row('................................................'), // 38
  row('................................................'), // 39
  row('................................................'), // 40
  row('................................................'), // 41
  row('................................................'), // 42
  row('................................................'), // 43
  row('................................................'), // 44
  row('................................................'), // 45
  row('................................................'), // 46
  row('................................................'), // 47
];

// IDLE_B — character breathes (shifts 1px down)
const IDLE_B = [
  row('................................................'), // 0
  row('................................................'), // 1
  row('................................................'), // 2
  row('................................................'), // 3
  row('................kkkkkk..........................'), // 4  hair top
  row('...............kHhhmmmkk........................'), // 5
  row('..............kHhhmmmmmhk.......................'), // 6
  row('..............khhmmmmmmmhk......................'), // 7
  row('..............khmsskssmhhk......................'), // 8
  row('..............khmsseussmhk......................'), // 9
  row('..............khmsssssmmhk......................'), // 10
  row('...............khhmssmhhk.......................'), // 11
  row('................kGGGGGGk........................'), // 12
  row('...............kGGgggGGGk.......................'), // 13
  row('..............kCCccccCCCk.......................'), // 14
  row('..............kCcccccccck.......................'), // 15
  row('..............kcccccccDDk.......................'), // 16
  row('..............kccccccDDDk.......................'), // 17
  row('.............kCcccpppcDDk.......................'), // 18
  row('.............kccppppppcck.......................'), // 19
  row('.............kccppppppppk.......................'), // 20
  row('.............kcppppppppck.......................'), // 21
  row('.............kccppppppcck.......................'), // 22
  row('.............kDDcppppcDDk.......................'), // 23
  row('..............kppppppppk........................'), // 24
  row('..............kpppppppk.........................'), // 25
  row('..............kppkkkppk.........................'), // 26
  row('..............kppk.kppk.........................'), // 27
  row('..............kppk.kppk.........................'), // 28
  row('..............kbpk.kbbk.........................'), // 29
  row('..............kbbk.kbbk.........................'), // 30
  row('...............kkk..kkk.........................'), // 31
  row('................................................'), // 32
  row('................................................'), // 33
  row('................................................'), // 34
  row('................................................'), // 35
  row('................................................'), // 36
  row('................................................'), // 37
  row('................................................'), // 38
  row('................................................'), // 39
  row('................................................'), // 40
  row('................................................'), // 41
  row('................................................'), // 42
  row('................................................'), // 43
  row('................................................'), // 44
  row('................................................'), // 45
  row('................................................'), // 46
  row('................................................'), // 47
];

// ---------------------------------------------------------------------------
// TRAVELING — walking right, satchel bag on left side, legs stride
// Frame A: left leg forward
// ---------------------------------------------------------------------------

const TRAVEL_A = [
  row('................................................'), // 0
  row('................................................'), // 1
  row('................................................'), // 2
  row('................kkkkkk..........................'), // 3  hair
  row('...............kHhhmmmkk........................'), // 4
  row('..............kHhhmmmmmhk.......................'), // 5
  row('..............khhmmmmmmmhk......................'), // 6
  row('..............khmsskssmhhk......................'), // 7
  row('..............khmsseussmhk......................'), // 8
  row('..............khmsssssmmhk......................'), // 9
  row('...............khhmssmhhk.......................'), // 10
  row('...kkkk.........kGGGGGGk........................'), // 11 scarf + bag top
  row('..ktTTtk.......kGGgggGGGk.......................'), // 12 bag + scarf
  row('..ktTTtk......kCCccccCCCk.......................'), // 13 bag + coat
  row('..kWtTtk......kCcccccccck.......................'), // 14 strap + coat
  row('..kWtttk......kcccccccDDk.......................'), // 15
  row('..ktttWk......kccccccDDDk.......................'), // 16
  row('...kkkk.......kCcccpppcDDk......................'), // 17 bag bottom
  row('..............kccppppppcck......................'), // 18
  row('..............kccppppppppk......................'), // 19
  row('..............kcppppppppck......................'), // 20
  row('..............kccppppppcck......................'), // 21
  row('..............kDDcppppcDDk......................'), // 22 coat hem
  row('..............kppppppppk........................'), // 23 upper legs
  row('.............kpppk.kpppk........................'), // 24 legs split
  row('............kppppk..kpppk.......................'), // 25 stride A: L fwd
  row('...........kpppppk...kppk.......................'), // 26
  row('...........kpppppk....kpk.......................'), // 27
  row('...........kbppppk....kbk.......................'), // 28 boot
  row('...........kbbbbbk....kbk.......................'), // 29
  row('............kkkkk......kk.......................'), // 30
  row('................................................'), // 31
  row('................................................'), // 32
  row('................................................'), // 33
  row('................................................'), // 34
  row('................................................'), // 35
  row('................................................'), // 36
  row('................................................'), // 37
  row('................................................'), // 38
  row('................................................'), // 39
  row('................................................'), // 40
  row('................................................'), // 41
  row('................................................'), // 42
  row('................................................'), // 43
  row('................................................'), // 44
  row('................................................'), // 45
  row('................................................'), // 46
  row('................................................'), // 47
];

// Frame B: right leg forward
const TRAVEL_B = [
  row('................................................'), // 0
  row('................................................'), // 1
  row('................................................'), // 2
  row('................kkkkkk..........................'), // 3
  row('...............kHhhmmmkk........................'), // 4
  row('..............kHhhmmmmmhk.......................'), // 5
  row('..............khhmmmmmmmhk......................'), // 6
  row('..............khmsskssmhhk......................'), // 7
  row('..............khmsseussmhk......................'), // 8
  row('..............khmsssssmmhk......................'), // 9
  row('...............khhmssmhhk.......................'), // 10
  row('...kkkk.........kGGGGGGk........................'), // 11
  row('..ktTTtk.......kGGgggGGGk.......................'), // 12
  row('..ktTTtk......kCCccccCCCk.......................'), // 13
  row('..kWtTtk......kCcccccccck.......................'), // 14
  row('..kWtttk......kcccccccDDk.......................'), // 15
  row('..ktttWk......kccccccDDDk.......................'), // 16
  row('...kkkk.......kCcccpppcDDk......................'), // 17
  row('..............kccppppppcck......................'), // 18
  row('..............kccppppppppk......................'), // 19
  row('..............kcppppppppck......................'), // 20
  row('..............kccppppppcck......................'), // 21
  row('..............kDDcppppcDDk......................'), // 22
  row('..............kppppppppk........................'), // 23
  row('.............kpppk.kpppk........................'), // 24 legs split
  row('............kpppk...kppppk......................'), // 25 stride B: R fwd
  row('...........kppk.....kpppppk.....................'), // 26
  row('...........kpk......kpppppk.....................'), // 27
  row('...........kbk......kbppppk.....................'), // 28 boot
  row('...........kbk......kbbbbbk.....................'), // 29
  row('............kk.......kkkkk......................'), // 30
  row('................................................'), // 31
  row('................................................'), // 32
  row('................................................'), // 33
  row('................................................'), // 34
  row('................................................'), // 35
  row('................................................'), // 36
  row('................................................'), // 37
  row('................................................'), // 38
  row('................................................'), // 39
  row('................................................'), // 40
  row('................................................'), // 41
  row('................................................'), // 42
  row('................................................'), // 43
  row('................................................'), // 44
  row('................................................'), // 45
  row('................................................'), // 46
  row('................................................'), // 47
];

// ---------------------------------------------------------------------------
// READING — seated, leaning forward over open book
// Frame A: relaxed posture
// ---------------------------------------------------------------------------

const READ_A = [
  row('................................................'), // 0
  row('................................................'), // 1
  row('................................................'), // 2
  row('................................................'), // 3
  row('................kkkkkk..........................'), // 4  hair
  row('...............kHhhmmmkk........................'), // 5
  row('..............kHhhmmmmmhk.......................'), // 6
  row('..............khhmmmmmmmhk......................'), // 7  leaning fwd
  row('.............khmsskssmhhk.......................'), // 8  face angled
  row('.............khmsseussmhk.......................'), // 9
  row('.............khmsssssmmhk.......................'), // 10
  row('..............khhmssmhhk........................'), // 11
  row('...............kGGGGGGk.........................'), // 12 scarf
  row('..............kGGgggGGGk........................'), // 13
  row('.............kCCccccCCCk........................'), // 14 coat hunched fwd
  row('.............kCccccccCck........................'), // 15
  row('..........kkkkcccccccDDk........................'), // 16 arm extends
  row('.........kOOOOOcccccDDDk........................'), // 17 book pages open
  row('.........kOOOOOOccpppDDk........................'), // 18
  row('.........koooOOOOOpppDDk........................'), // 19 book cover + pages
  row('.........kooooOOOOpppcck........................'), // 20
  row('..........kkkkkOOOOpcck.........................'), // 21
  row('.............kcOOOpppcck........................'), // 22
  row('.............kccpppppppk........................'), // 23
  row('.............kccppppppck........................'), // 24
  row('.............kDcppppcDDk........................'), // 25
  row('.............kppppppppk.........................'), // 26
  row('.............kpppkkkppk.........................'), // 27
  row('.............kpppk.kppk.........................'), // 28
  row('.............kpppk.kppk.........................'), // 29
  row('.............kbppk.kbbk.........................'), // 30
  row('.............kbbbk.kbbk.........................'), // 31
  row('..............kkkk..kkk.........................'), // 32
  row('................................................'), // 33
  row('................................................'), // 34
  row('................................................'), // 35
  row('................................................'), // 36
  row('................................................'), // 37
  row('................................................'), // 38
  row('................................................'), // 39
  row('................................................'), // 40
  row('................................................'), // 41
  row('................................................'), // 42
  row('................................................'), // 43
  row('................................................'), // 44
  row('................................................'), // 45
  row('................................................'), // 46
  row('................................................'), // 47
];

// Frame B: slightly different book position (page turn subtle)
const READ_B = [
  row('................................................'), // 0
  row('................................................'), // 1
  row('................................................'), // 2
  row('................................................'), // 3
  row('................kkkkkk..........................'), // 4
  row('...............kHhhmmmkk........................'), // 5
  row('..............kHhhmmmmmhk.......................'), // 6
  row('..............khhmmmmmmmhk......................'), // 7
  row('.............khmsskssmhhk.......................'), // 8
  row('.............khmsseussmhk.......................'), // 9
  row('.............khmsssssmmhk.......................'), // 10
  row('..............khhmssmhhk........................'), // 11
  row('...............kGGGGGGk.........................'), // 12
  row('..............kGGgggGGGk........................'), // 13
  row('.............kCCccccCCCk........................'), // 14
  row('.............kCccccccCck........................'), // 15
  row('..........kkkkcccccccDDk........................'), // 16
  row('.........kOOOOOcccccDDDk........................'), // 17 book
  row('........kOOOOOOOccpppDDk........................'), // 18 page spread wider
  row('........koooOOOOOOpppDDk........................'), // 19
  row('........kooooOOOOOpppcck........................'), // 20
  row('.........kkkkkoOOOpcck..........................'), // 21
  row('.............kcOOOpppcck........................'), // 22
  row('.............kccpppppppk........................'), // 23
  row('.............kccppppppck........................'), // 24
  row('.............kDcppppcDDk........................'), // 25
  row('.............kppppppppk.........................'), // 26
  row('.............kpppkkkppk.........................'), // 27
  row('.............kpppk.kppk.........................'), // 28
  row('.............kpppk.kppk.........................'), // 29
  row('.............kbppk.kbbk.........................'), // 30
  row('.............kbbbk.kbbk.........................'), // 31
  row('..............kkkk..kkk.........................'), // 32
  row('................................................'), // 33
  row('................................................'), // 34
  row('................................................'), // 35
  row('................................................'), // 36
  row('................................................'), // 37
  row('................................................'), // 38
  row('................................................'), // 39
  row('................................................'), // 40
  row('................................................'), // 41
  row('................................................'), // 42
  row('................................................'), // 43
  row('................................................'), // 44
  row('................................................'), // 45
  row('................................................'), // 46
  row('................................................'), // 47
];

const FRAMES: Record<PixelReaderState, string[][]> = {
  idle: [IDLE_A, IDLE_B],
  traveling: [TRAVEL_A, TRAVEL_B],
  reading: [READ_A, READ_B],
};

const TOKEN_CLASS: Record<string, string> = {
  k: 'px--outline',
  // hair
  H: 'px--hair',
  h: 'px--hair',
  m: 'px--hair',
  // skin
  S: 'px--skin',
  s: 'px--skin',
  u: 'px--skin',
  e: 'px--eye',
  // scarf
  G: 'px--scarf',
  g: 'px--scarf',
  // coat
  C: 'px--coat',
  c: 'px--coat',
  D: 'px--coat',
  // pants
  P: 'px--pants',
  p: 'px--pants',
  // boot
  B: 'px--boot',
  b: 'px--boot',
  // book
  O: 'px--book',
  o: 'px--book',
  v: 'px--book',
  // bag / suitcase
  T: 'px--suitcase',
  t: 'px--suitcase',
  W: 'px--suitcase',
  w: 'px--suitcase',
};

const BASE_PALETTE: Record<string, RGBA> = {
  k: [12, 8, 6, 255],
  // hair: near-black with subtle highlight
  H: [62, 42, 24, 255],     // hair highlight
  h: [38, 24, 12, 255],     // hair mid
  m: [18, 11, 6, 255],      // hair dark
  // skin: warm, bright enough to read on dark bg
  S: [228, 192, 152, 255],  // skin light
  s: [205, 165, 122, 255],  // skin mid
  u: [172, 132, 90, 255],   // skin shadow
  e: [30, 20, 12, 255],     // eye
  // scarf: vivid burnt-orange — contrasts warmly against the room
  G: [210, 118, 48, 255],   // scarf light
  g: [172, 88, 28, 255],    // scarf dark
  // coat: cool medium navy — clear contrast against warm brown room
  C: [72, 88, 118, 255],    // coat light edge
  c: [52, 65, 92, 255],     // coat mid
  D: [32, 42, 62, 255],     // coat dark shadow
  // pants: slightly lighter navy
  P: [64, 78, 108, 255],    // pants light
  p: [46, 58, 84, 255],     // pants mid
  // boot: dark warm brown
  B: [52, 36, 20, 255],     // boot light
  b: [30, 18, 8, 255],      // boot dark
  // book: cream pages + warm cover
  O: [242, 232, 210, 255],  // page
  o: [148, 102, 56, 255],   // cover
  v: [116, 78, 38, 255],    // cover dark
  // bag: tan leather
  T: [130, 94, 54, 255],    // bag light
  t: [88, 60, 32, 255],     // bag dark
  W: [68, 48, 26, 255],     // strap
  w: [58, 40, 20, 255],     // strap dark
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseColor(input: string): [number, number, number] | null {
  const value = input.trim().toLowerCase();
  const shortHex = value.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split('').map((part) => parseInt(part + part, 16));
    return [r, g, b];
  }

  const longHex = value.match(/^#([0-9a-f]{6})$/i);
  if (longHex) {
    return [
      parseInt(longHex[1].slice(0, 2), 16),
      parseInt(longHex[1].slice(2, 4), 16),
      parseInt(longHex[1].slice(4, 6), 16),
    ];
  }

  const rgb = value.match(/^rgb\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*\)$/i);
  if (rgb) {
    return [
      clamp(parseInt(rgb[1], 10), 0, 255),
      clamp(parseInt(rgb[2], 10), 0, 255),
      clamp(parseInt(rgb[3], 10), 0, 255),
    ];
  }

  return null;
}

function shade([r, g, b]: [number, number, number], delta: number): [number, number, number] {
  return [
    clamp(r + delta, 0, 255),
    clamp(g + delta, 0, 255),
    clamp(b + delta, 0, 255),
  ];
}

function paletteWithAccent(accentColor?: string): Record<string, RGBA> {
  const palette = { ...BASE_PALETTE };
  const parsed = accentColor ? parseColor(accentColor) : null;
  if (!parsed) return palette;

  const scarfLight = shade(parsed, 28);
  const scarfMid = shade(parsed, 0);
  const bagLight = shade(parsed, -18);
  const bagDark = shade(parsed, -42);
  const strap = shade(parsed, -58);

  palette.G = [scarfLight[0], scarfLight[1], scarfLight[2], 255];
  palette.g = [scarfMid[0], scarfMid[1], scarfMid[2], 255];
  palette.T = [bagLight[0], bagLight[1], bagLight[2], 255];
  palette.t = [bagDark[0], bagDark[1], bagDark[2], 255];
  palette.W = [strap[0], strap[1], strap[2], 255];
  return palette;
}

export class PixelReader {
  private readonly root: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private state: PixelReaderState;
  private direction: PixelReaderDirection;
  private size: PixelReaderSize;
  private palette: Record<string, RGBA>;
  private frameIndex = 0;
  private rafId = 0;
  private lastTick = 0;

  constructor(options: PixelReaderOptions = {}) {
    this.state = options.state ?? 'idle';
    this.direction = options.direction ?? 'right';
    this.size = options.size ?? 'md';
    this.palette = paletteWithAccent(options.accentColor);

    this.root = document.createElement('div');
    this.root.className = `pixel-reader ${options.className ?? ''}`.trim();

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${FRAME_W} ${FRAME_H}`);
    this.svg.setAttribute('aria-hidden', 'true');
    this.svg.setAttribute('focusable', 'false');
    this.root.appendChild(this.svg);

    this.applyRootAttributes();
    this.renderFrame();
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root);
    this.tick(0);
  }

  unmount(): void {
    cancelAnimationFrame(this.rafId);
    this.root.remove();
  }

  setState(state: PixelReaderState): void {
    if (this.state === state) return;
    this.state = state;
    this.frameIndex = 0;
    this.lastTick = 0;
    this.applyRootAttributes();
    this.renderFrame();
  }

  setDirection(direction: PixelReaderDirection): void {
    if (this.direction === direction) return;
    this.direction = direction;
    this.applyRootAttributes();
  }

  setSize(size: PixelReaderSize): void {
    if (this.size === size) return;
    this.size = size;
    this.applyRootAttributes();
  }

  setAccentColor(color: string): void {
    this.palette = paletteWithAccent(color);
    this.renderFrame();
  }

  get element(): HTMLElement {
    return this.root;
  }

  private applyRootAttributes(): void {
    this.root.dataset.state = this.state;
    this.root.dataset.direction = this.direction;
    this.root.dataset.size = this.size;
    const scale = SIZE_SCALE[this.size];
    this.root.style.width = `${FRAME_W * scale}px`;
    this.root.style.height = `${FRAME_H * scale}px`;
  }

  private tick = (timestamp: number): void => {
    const frameMs = FRAME_INTERVAL[this.state];
    if (timestamp - this.lastTick >= frameMs) {
      this.lastTick = timestamp;
      this.frameIndex = (this.frameIndex + 1) % FRAMES[this.state].length;
      this.renderFrame();
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  private renderFrame(): void {
    const frame = FRAMES[this.state][this.frameIndex];
    this.svg.innerHTML = '';
    for (let y = 0; y < FRAME_H; y++) {
      const row = frame[y];
      for (let x = 0; x < FRAME_W; x++) {
        const token = row[x];
        if (token === '.') continue;
        const color = this.palette[token];
        if (!color) continue;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', '1');
        rect.setAttribute('height', '1');
        rect.setAttribute('fill', `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`);
        rect.setAttribute('class', `px ${TOKEN_CLASS[token] ?? ''}`.trim());
        this.svg.appendChild(rect);
      }
    }
  }
}

// Backward-compatible export for existing map code.
export type AvatarState = 'idle' | 'walk' | 'read';

export class PixelAvatar {
  private reader: PixelReader;

  constructor(options: { state?: AvatarState; accentColor?: string; scale?: number } = {}) {
    this.reader = new PixelReader({
      state: avatarStateToReaderState(options.state ?? 'idle'),
      size: scaleToSize(options.scale ?? 3),
      accentColor: options.accentColor,
      direction: 'right',
    });
  }

  setState(state: AvatarState): void {
    this.reader.setState(avatarStateToReaderState(state));
  }

  setAccentColor(color: string): void {
    this.reader.setAccentColor(color);
  }

  mount(container: HTMLElement): void {
    this.reader.mount(container);
  }

  unmount(): void {
    this.reader.unmount();
  }

  get element(): HTMLElement {
    return this.reader.element;
  }
}

function avatarStateToReaderState(state: AvatarState): PixelReaderState {
  if (state === 'walk') return 'traveling';
  if (state === 'read') return 'reading';
  return 'idle';
}

function scaleToSize(scale: number): PixelReaderSize {
  if (scale <= 2) return 'sm';
  if (scale >= 4) return 'lg';
  return 'md';
}

export function buildPixelReaderDemo(): HTMLElement {
  const host = document.createElement('div');
  host.className = 'pixel-reader-demo';
  const demos: Array<{ state: PixelReaderState; direction: PixelReaderDirection; label: string }> = [
    { state: 'traveling', direction: 'left', label: 'Traveling Left' },
    { state: 'traveling', direction: 'right', label: 'Traveling Right' },
    { state: 'reading', direction: 'right', label: 'Reading' },
    { state: 'idle', direction: 'right', label: 'Idle' },
  ];

  demos.forEach(({ state, direction, label }) => {
    const card = document.createElement('div');
    card.className = 'pixel-reader-demo__item';
    const spriteMount = document.createElement('div');
    spriteMount.className = 'pixel-reader-demo__sprite';
    const sprite = new PixelReader({ state, direction, size: 'lg' });
    sprite.mount(spriteMount);
    const text = document.createElement('span');
    text.className = 'pixel-reader-demo__label';
    text.textContent = label;
    card.append(spriteMount, text);
    host.appendChild(card);
  });

  return host;
}
