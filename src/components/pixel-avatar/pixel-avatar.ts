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

const FRAME_W = 32;
const FRAME_H = 32;

const FRAME_INTERVAL: Record<PixelReaderState, number> = {
  idle: 900,
  traveling: 280,
  reading: 1050,
};

const SIZE_SCALE: Record<PixelReaderSize, number> = {
  sm: 1,
  md: 2,
  lg: 3,
};

function row(pattern = ''): string {
  return pattern.padEnd(FRAME_W, '.').slice(0, FRAME_W);
}

const IDLE_A = [
  row(),
  row(),
  row(),
  row(),
  row('....................kkkk........'),
  row('..................kkhmmkk......'),
  row('.................kkhmmmmhkk.....'),
  row('................kkhmmnmmmhkk....'),
  row('................khmsskssmhhk....'),
  row('................khmssussmhhk....'),
  row('................khhmusssmhhk....'),
  row('................kkhhmssmhhkk....'),
  row('.................kkhhhhhhkk.....'),
  row('.................kdcggcddk......'),
  row('................kdddggdddk......'),
  row('................kddddccddk......'),
  row('................kdddcccqdk......'),
  row('................kppdccpqdk......'),
  row('................kpppppppdk......'),
  row('...............kbpppppppbk......'),
  row('...............kbpppppppbk......'),
  row('...............kbppkkpppbk......'),
  row('................kbbk..kbbk......'),
  row('................kbbk..kbbk......'),
  row('...............kkk....kkk.......'),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
];

const IDLE_B = [
  row(),
  row(),
  row(),
  row(),
  row(),
  row('....................kkkk........'),
  row('..................kkhmmkk......'),
  row('.................kkhmmmmhkk.....'),
  row('................kkhmmnmmmhkk....'),
  row('................khmsskssmhhk....'),
  row('................khmssussmhhk....'),
  row('................khhmusssmhhk....'),
  row('................kkhhmssmhhkk....'),
  row('.................kkhhhhhhkk.....'),
  row('.................kdcggcddk......'),
  row('................kdddggdddk......'),
  row('................kddddccddk......'),
  row('................kdddcccqdk......'),
  row('................kppdccpqdk......'),
  row('................kpppppppdk......'),
  row('...............kbpppppppbk......'),
  row('...............kbpppppppbk......'),
  row('...............kbppkkpppbk......'),
  row('................kbbk..kbbk......'),
  row('................kbbk..kbbk......'),
  row('...............kkk....kkk.......'),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
];

const TRAVEL_A = [
  row(),
  row(),
  row(),
  row(),
  row('.....................kkkk.......'),
  row('...................kkhmmkk......'),
  row('..................kkhmmmmhkk.....'),
  row('.................kkhmmnmmmhkk....'),
  row('....kkkk.........khmsskssmhhk....'),
  row('...kttttk........khmssussmhhk....'),
  row('..ktwwwwtk.......khhmusssmhhk....'),
  row('..ktwwwwtk.......kkhhmssmhhkk....'),
  row('..ktwwwwtk........kkhhhhhhkk.....'),
  row('..ktwwwwtk........kdcggcddkk.....'),
  row('...kttttk........kdddggddddk.....'),
  row('....kkkk.........kddddccdddk.....'),
  row('.................kdddcccqddk.....'),
  row('.................kppddccpqdk.....'),
  row('.................kppppppppdk.....'),
  row('................kbppppppppbk.....'),
  row('................kbppppppppbk.....'),
  row('...............kbppkkppppbbk.....'),
  row('...............kbbbk..kbpbbk.....'),
  row('..............kbbbbk..kbbbbk.....'),
  row('...............kkkk....kkkk......'),
  row('...............k..k....k..k......'),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
];

const TRAVEL_B = [
  row(),
  row(),
  row(),
  row(),
  row('.....................kkkk.......'),
  row('...................kkhmmkk......'),
  row('..................kkhmmmmhkk.....'),
  row('.................kkhmmnmmmhkk....'),
  row('....kkkk.........khmsskssmhhk....'),
  row('...kttttk........khmssussmhhk....'),
  row('..ktwwwwtk.......khhmusssmhhk....'),
  row('..ktwwwwtk.......kkhhmssmhhkk....'),
  row('..ktwwwwtk........kkhhhhhhkk.....'),
  row('..ktwwwwtk........kdcggcddkk.....'),
  row('...kttttk........kdddggddddk.....'),
  row('....kkkk.........kddddccdddk.....'),
  row('.................kdddcccqddk.....'),
  row('.................kppddccpqdk.....'),
  row('.................kppppppppdk.....'),
  row('................kbppppppppbk.....'),
  row('................kbppppppppbk.....'),
  row('................kbbppkkpppbk.....'),
  row('...............kbbpbk..kbbbk.....'),
  row('...............kbbbbk..kbbbbk....'),
  row('................kkkk....kkkk.....'),
  row('...............k..k......k..k....'),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
];

const READ_A = [
  row(),
  row(),
  row(),
  row(),
  row('.....................kkkk.......'),
  row('...................kkhmmkk......'),
  row('..................kkhmmmmhkk.....'),
  row('.................kkhmmnmmmhkk....'),
  row('.................khmsskssmhhk....'),
  row('.................khmssussmhhk....'),
  row('.................khhmusssmhhk....'),
  row('..............kkkkhhmssmhhkk.....'),
  row('............kkvooooohhhhkk......'),
  row('...........kvvvoooooogdddk......'),
  row('...........kvvvooooocccddk......'),
  row('............kddvooooocccdk......'),
  row('............kdddcccccccpdk......'),
  row('............kpppccdddpppdk......'),
  row('...........kbpppcdddppppbk......'),
  row('.........kkbpppk..kppppbbk......'),
  row('........kbbbbbk...kppbbbk.......'),
  row('........kbbbbk....kbbbbbk.......'),
  row('.........kkkk......kkkkk........'),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
];

const READ_B = [
  row(),
  row(),
  row(),
  row(),
  row('.....................kkkk.......'),
  row('...................kkhmmkk......'),
  row('..................kkhmmmmhkk.....'),
  row('.................kkhmmnmmmhkk....'),
  row('.................khmsskssmhhk....'),
  row('.................khmssussmhhk....'),
  row('.................khhmusssmhhk....'),
  row('..............kkkkhhmssmhhkk.....'),
  row('............kkvoooooohhhhkk......'),
  row('...........kvvvooooooogdddk......'),
  row('...........kvvvoooooocccddk......'),
  row('............kddvooooocccdk......'),
  row('............kdddcccccccpdk......'),
  row('............kpppccdddpppdk......'),
  row('...........kbpppcdddppppbk......'),
  row('..........kbbppk..kppppbbk......'),
  row('.........kbbbbbk...kppbbbk......'),
  row('.........kbbbbk....kbbbbbk......'),
  row('..........kkkk......kkkkk.......'),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
];

const FRAMES: Record<PixelReaderState, string[][]> = {
  idle: [IDLE_A, IDLE_B],
  traveling: [TRAVEL_A, TRAVEL_B],
  reading: [READ_A, READ_B],
};

const TOKEN_CLASS: Record<string, string> = {
  k: 'px--outline',
  h: 'px--hair',
  m: 'px--hair',
  n: 'px--hair',
  s: 'px--skin',
  u: 'px--skin',
  c: 'px--coat',
  d: 'px--coat',
  q: 'px--pants',
  g: 'px--scarf',
  p: 'px--pants',
  b: 'px--boot',
  o: 'px--book',
  v: 'px--book',
  t: 'px--suitcase',
  w: 'px--suitcase',
};

const BASE_PALETTE: Record<string, RGBA> = {
  k: [19, 14, 10, 255],
  h: [28, 18, 12, 255],
  m: [55, 35, 23, 255],
  n: [108, 68, 41, 255],
  s: [205, 171, 135, 255],
  u: [168, 128, 90, 255],
  c: [26, 27, 33, 255],
  d: [43, 45, 54, 255],
  q: [31, 34, 42, 255],
  g: [142, 112, 67, 255],
  p: [41, 44, 52, 255],
  b: [33, 25, 18, 255],
  o: [230, 220, 198, 255],
  v: [121, 83, 44, 255],
  t: [72, 47, 28, 255],
  w: [126, 83, 47, 255],
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

  const coatDeep = shade(parsed, -76);
  const coatMid = shade(parsed, -56);
  const pantsMid = shade(parsed, -64);
  const pantsDark = shade(parsed, -82);
  const scarfBase = shade(parsed, 4);
  const suitcaseDark = shade(parsed, -36);
  const suitcaseLight = shade(parsed, -8);
  const bookCover = shade(parsed, -18);

  palette.c = [coatDeep[0], coatDeep[1], coatDeep[2], 255];
  palette.d = [coatMid[0], coatMid[1], coatMid[2], 255];
  palette.p = [pantsMid[0], pantsMid[1], pantsMid[2], 255];
  palette.q = [pantsDark[0], pantsDark[1], pantsDark[2], 255];
  palette.g = [scarfBase[0], scarfBase[1], scarfBase[2], 255];
  palette.t = [suitcaseDark[0], suitcaseDark[1], suitcaseDark[2], 255];
  palette.w = [suitcaseLight[0], suitcaseLight[1], suitcaseLight[2], 255];
  palette.v = [bookCover[0], bookCover[1], bookCover[2], 255];
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
    { state: 'traveling', direction: 'left', label: 'traveling left' },
    { state: 'traveling', direction: 'right', label: 'traveling right' },
    { state: 'reading', direction: 'right', label: 'reading' },
    { state: 'idle', direction: 'right', label: 'idle' },
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
