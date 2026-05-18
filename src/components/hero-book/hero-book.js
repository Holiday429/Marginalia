/**
 * HeroBook — reusable wrapper around the preloader's GLB hero-book renderer.
 *
 * Builds the minimal `.book.hero-3d` DOM that `mountHeroGLB` expects (it reads
 * `--spine-w`, `--expand`, `--hero-stage-clearance`, `--book-h` and watches the
 * `opened` class), then mounts the same Three.js GLB render used on the
 * preloader. `open()` / `close()` drive the spine ↔ cover flip.
 */
import { mountHeroGLB } from '../../preloader/hero-glb.js';

const HERO_SEED = {
  title: 'VISIBLE SIGNS',
  spine: '#1a2550',
  coverBg: '#1a2550',
  coverText: '#e8dfc8',
  w: 86,
  depth: 62,
};

export class HeroBook {
  /**
   * @param {{ height?: number }} [options] target rendered book height in px.
   */
  constructor(options = {}) {
    this.height = options.height ?? 240;
    this.bookEl = null;
    this.teardown = null;
  }

  mount(container) {
    const baseH = this.height;
    const w = HERO_SEED.w;
    const coverW = Math.round(Math.max(w * 2.4, 100));
    const expand = coverW - w;
    const clearance = Math.round(Math.max(18, Math.min(32, coverW * 0.12)));
    // Scale the shelf-units to the requested pixel height.
    const scale = baseH / 460;
    const sW = Math.round(w * scale);
    const sCoverW = Math.round(coverW * scale);
    const sExpand = sCoverW - sW;
    const sClearance = Math.round(clearance * scale);

    const book = document.createElement('div');
    book.className = 'book hero-3d hero-fallback hero-book';
    book.dataset.role = 'hero';
    book.style.width = sW + 'px';
    book.style.height = baseH + 'px';
    book.style.setProperty('--book-h', baseH + 'px');
    book.style.setProperty('--book-depth', Math.round(HERO_SEED.depth * scale) + 'px');
    book.style.setProperty('--book-color', HERO_SEED.spine);
    book.style.setProperty('--cover-w', sCoverW + 'px');
    book.style.setProperty('--spine-w', sW + 'px');
    book.style.setProperty('--spine-half', sW / 2 + 'px');
    book.style.setProperty('--half-depth', sCoverW / 2 + 'px');
    book.style.setProperty('--expand', sExpand + 'px');
    book.style.setProperty('--expand-half', sExpand / 2 + 'px');
    book.style.setProperty('--hero-stage-clearance', sClearance + 'px');

    const inner = document.createElement('div');
    inner.className = 'book-inner';
    inner.style.width = sCoverW + 'px';
    inner.style.height = baseH + 'px';

    const cover = document.createElement('div');
    cover.className = 'cover cover-visible-signs';
    cover.style.setProperty('--cover-bg', HERO_SEED.coverBg);
    cover.style.setProperty('--cover-text', HERO_SEED.coverText);
    cover.innerHTML = `
      <div class="cover-mark">Marginalia · Vol. 04</div>
      <div>
        <div class="cover-title-stack">Visible<br>Signs</div>
        <div class="cover-art">
          <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
            <circle cx="40" cy="40" r="32" stroke="currentColor" stroke-width="1" opacity="0.5"/>
            <circle cx="40" cy="40" r="20" stroke="currentColor" stroke-width="1" opacity="0.7"/>
            <circle cx="40" cy="40" r="8"  fill="currentColor"  opacity="0.8"/>
            <line x1="40" y1="4"  x2="40" y2="76" stroke="currentColor" stroke-width="0.5" opacity="0.4"/>
            <line x1="4"  y1="40" x2="76" y2="40" stroke="currentColor" stroke-width="0.5" opacity="0.4"/>
          </svg>
        </div>
      </div>
      <div class="cover-footer">— David Crow · 2003 —</div>
    `;
    inner.appendChild(cover);

    const spine = document.createElement('div');
    spine.className = 'spine';
    spine.style.setProperty('--book-color', HERO_SEED.spine);
    spine.style.setProperty('--book-text', HERO_SEED.coverText);
    const st = document.createElement('div');
    st.className = 'spine-text';
    st.textContent = HERO_SEED.title;
    spine.appendChild(st);
    inner.appendChild(spine);

    const back = document.createElement('div');
    back.className = 'back';
    back.style.setProperty('--cover-bg', HERO_SEED.coverBg);
    inner.appendChild(back);

    const shadow = document.createElement('div');
    shadow.className = 'book-shadow';

    book.appendChild(inner);
    book.appendChild(shadow);
    container.appendChild(book);

    this.bookEl = book;
    this.teardown = mountHeroGLB(book);
  }

  /** Swing the cover open (cover-forward flip). */
  open() {
    this.bookEl?.classList.add('opening', 'opened');
  }

  /** Return to spine-forward rest. */
  close() {
    if (!this.bookEl) return;
    this.bookEl.classList.remove('opened');
    window.setTimeout(() => this.bookEl?.classList.remove('opening'), 1300);
  }

  unmount() {
    this.teardown?.();
    this.teardown = null;
    this.bookEl?.remove();
    this.bookEl = null;
  }
}
