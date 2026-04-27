/* Marginalia preloader — bookshelf swing + open animation */

const TWEAK_DEFAULTS = {
  speed: 0.8,
  swingIntensity: 100,
  theme: "ink",
  palette: "editorial",
};

const state = { ...TWEAK_DEFAULTS };

// --- Build shelf ---------------------------------------------------

const track = document.getElementById('track');

function buildShelf(paletteName) {
  const palette = window.BOOKS[paletteName] || window.BOOKS.editorial;
  track.innerHTML = '';

  const baseH = Math.min(window.innerHeight * 0.52, 460);
  const tilts = [0, -1.2, 0, 0.8, 0, 0, -0.6, 0, 0, 1.4, 0, -0.9, 0, 0.5, 0];
  const dips  = [0, 0,    1, 0,   2, 0, 0,    0, 1, 0,   0, 0,    2, 0,   0];

  palette.forEach((b, idx) => {
    const book = document.createElement('div');
    book.className = 'book';
    book.dataset.idx = idx;
    if (b.hero)   { book.dataset.role = 'hero';   book.classList.add('hero-3d'); }
    if (b.accent) { book.dataset.role = 'accent'; }

    const h = Math.round(baseH * b.h);
    const w = b.w;
    const depth = b.depth;
    const coverW = Math.round(Math.max(w * 2.4, 100));
    const expand = coverW - w;
    const heroStageClearance = b.hero ? Math.round(Math.max(18, Math.min(32, coverW * 0.12))) : 0;

    book.style.width  = w + 'px';
    book.style.height = h + 'px';
    book.style.setProperty('--book-h',    h + 'px');
    book.style.setProperty('--book-depth', depth + 'px');
    book.style.setProperty('--book-color', b.spine);
    book.style.setProperty('--cover-w',   coverW + 'px');
    book.style.setProperty('--spine-w',   w + 'px');
    book.style.setProperty('--spine-half', (w / 2) + 'px');
    book.style.setProperty('--half-depth', (coverW / 2) + 'px');
    book.style.setProperty('--expand',     expand + 'px');
    book.style.setProperty('--expand-half', (expand / 2) + 'px');
    book.style.setProperty('--hero-stage-clearance', heroStageClearance + 'px');

    if (!b.hero && !b.accent) {
      book.style.setProperty('--tilt', tilts[idx % tilts.length] + 'deg');
      book.style.setProperty('--dip',  dips[idx % dips.length]   + 'px');
    }

    const inner = document.createElement('div');
    inner.className = 'book-inner';
    inner.style.width  = (b.hero ? coverW : w) + 'px';
    inner.style.height = h + 'px';

    // Spine face
    const spine = document.createElement('div');
    spine.className = 'spine';
    spine.style.setProperty('--book-color',    b.spine);
    spine.style.setProperty('--book-text',     b.text);
    spine.style.setProperty('--book-font',     b.font);
    spine.style.setProperty('--book-weight',   b.weight);
    spine.style.setProperty('--book-size',     b.size + 'px');
    spine.style.setProperty('--book-tracking', b.tracking);
    if (b.case) spine.style.setProperty('--book-case', b.case);
    if (b.band) spine.style.setProperty('--spine-band', b.band);

    if (b.topMark) {
      const tm = document.createElement('div');
      tm.className = 'spine-top-mark';
      tm.textContent = b.topMark;
      spine.appendChild(tm);
    }
    const st = document.createElement('div');
    st.className = 'spine-text';
    st.textContent = b.title;
    spine.appendChild(st);

    const sa = document.createElement('div');
    sa.className = 'spine-author';
    sa.textContent = b.author;
    spine.appendChild(sa);

    const isOpener = b.hero || b.accent || idx === 10 || idx === 6;

    if (isOpener) {
      const cover = document.createElement('div');
      cover.className = 'cover';
      cover.style.setProperty('--cover-bg',     b.coverBg);
      cover.style.setProperty('--cover-text',   b.coverText);
      cover.style.setProperty('--cover-font',   b.coverFont);
      cover.style.setProperty('--cover-weight', b.coverWeight);
      cover.style.setProperty('--cover-size',   Math.min(b.coverSize, coverW * 0.38) + 'px');
      if (b.coverAlign) cover.style.setProperty('--cover-align', b.coverAlign);
      if (b.coverCase)  cover.style.setProperty('--cover-case',  b.coverCase);

      if (b.hero) {
        cover.classList.add('cover-visible-signs');
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
      } else {
        const rule1 = document.createElement('div');
        rule1.style.cssText = `position:absolute;left:12%;right:12%;top:20%;height:1px;background:${b.coverText};opacity:0.3;`;
        cover.appendChild(rule1);
        const rule2 = document.createElement('div');
        rule2.style.cssText = `position:absolute;left:12%;right:12%;bottom:24%;height:1px;background:${b.coverText};opacity:0.3;`;
        cover.appendChild(rule2);

        const ct = document.createElement('div');
        ct.className = 'cover-title';
        ct.textContent = b.title;
        cover.appendChild(ct);

        const bottom = document.createElement('div');
        bottom.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:100%;';
        const ca = document.createElement('div');
        ca.className = 'cover-author';
        ca.textContent = b.author;
        bottom.appendChild(ca);
        const cm = document.createElement('div');
        cm.className = 'cover-meta';
        cm.textContent = 'Marginalia · Vol. 04';
        bottom.appendChild(cm);
        cover.appendChild(bottom);
      }

      inner.appendChild(cover);

      if (b.hero) {
        const back = document.createElement('div');
        back.className = 'back';
        back.style.setProperty('--cover-bg', b.coverBg);
        inner.appendChild(back);
      }
    }

    const shadow = document.createElement('div');
    shadow.className = 'book-shadow';

    inner.appendChild(spine);
    book.appendChild(inner);
    book.appendChild(shadow);
    track.appendChild(book);
  });
}

// --- Animation sequence -------------------------------------------

let animTimer = null;
let ctaBookEl = null;
let sequenceStopped = false;
let bookTransitionTimers = [];

function clearBookTransitionTimers() {
  bookTransitionTimers.forEach(clearTimeout);
  bookTransitionTimers = [];
}

function resetBookStates(books) {
  books.forEach(b => {
    b.classList.remove('opened', 'opening', 'cta', 'docked');
    b.style.transform = '';
    b.style.marginLeft = '';
    b.style.marginRight = '';
    b.style.animation = '';
    b.style.transition = '';
    b.onclick = null;
    const label = b.querySelector('.cta-label');
    if (label) label.remove();
  });
  ctaBookEl = null;
}

function clearTimers() {
  sequenceStopped = true;
  animTimer && animTimer.forEach(clearTimeout);
  animTimer = [];
}

function runSequence() {
  clearBookTransitionTimers();
  sequenceStopped = false;
  clearTimers();
  sequenceStopped = false;
  document.getElementById('loaderMeta').classList.remove('done');
  document.getElementById('loaderLabel').textContent = 'Arranging shelf';

  const books = [...track.querySelectorAll('.book')];
  resetBookStates(books);

  const speed = state.speed;
  const s = (ms) => ms / speed;

  {
    const heroIdx = getHeroIdx();
    const T = animTimer = [];
    const vw = track.parentElement.clientWidth;

    // Hero book is always clickable — skip animation and go to home
    const heroEl = books[heroIdx];
    if (heroEl) {
      heroEl.style.cursor = 'pointer';
      heroEl.onclick = () => {
        clearTimers();
        enterCTAState(books, heroIdx);
      };
    }

    // Measure how far to shift so hero sits just off the left edge,
    // leaving only the books to hero's right visible on screen.
    // We'll calculate this after a frame so layout is complete.
    function getShift() {
      const heroEl = books[heroIdx];
      if (!heroEl) return Math.round(vw * 0.55);
      const trackRect = track.getBoundingClientRect();
      const heroRect  = heroEl.getBoundingClientRect();
      const heroCenterX = heroRect.left + heroRect.width / 2 - trackRect.left;
      const trackHalfW  = trackRect.width / 2;
      // Shift so hero ends up ~40px left of viewport left edge
      return Math.round(heroCenterX - trackHalfW + vw / 2 + 40);
    }

    const SLIDE_DUR = 2400;

    // Calculate start (right) and end-left positions based on hero location.
    // We need layout to be complete, so force a frame first.
    function getPositions() {
      const heroEl = books[heroIdx];
      const trackRect = track.getBoundingClientRect();
      const heroRect  = heroEl.getBoundingClientRect();

      // Hero's left edge relative to track's left edge
      const heroLeft = heroRect.left - trackRect.left;
      // Hero's right edge relative to track's left edge
      const heroRight = heroRect.right - trackRect.left;

      const centeredTrackLeft = (vw - trackRect.width) / 2;
      // Start pos: hero center sits at ~75% of viewport width (right side, but visible)
      const heroCenterInTrack = heroLeft + heroRect.width / 2;
      const startShift = -(heroCenterInTrack - centeredTrackLeft - vw * 0.75);

      // Left stop: hero's RIGHT edge aligns with viewport LEFT edge (- small gap)
      const leftShift = -(heroRight - centeredTrackLeft + 40);

      return { startShift, leftShift };
    }

    // Set start position immediately (no transition)
    track.style.transition = 'none';
    // Temporarily place at center to measure, then snap to start
    track.style.transform = 'translateX(-50%)';

    T.push(setTimeout(() => {
      const { startShift, leftShift } = getPositions();

      // Snap to start position (right — hero's left books visible)
      track.style.transition = 'none';
      track.style.transform  = `translateX(calc(-50% + ${startShift}px))`;

      // 1. Sweep left to stop position (hero's right books visible)
      setTimeout(() => {
        if (sequenceStopped) return;
        const totalDist = Math.abs(startShift - leftShift);
        const leftDur   = Math.round(totalDist / (vw / SLIDE_DUR));
        track.style.transition = `transform ${s(leftDur)}ms linear`;
        track.style.transform  = `translateX(calc(-50% + ${leftShift}px))`;

        // Nudge a couple of books during the slide
        const nudgeTargets = pickNudgeTargets(books, heroIdx);
        nudgeTargets.forEach(({ el, marginLeft, marginRight, tilt, delay }) => {
          setTimeout(() => {
            if (sequenceStopped) return;
            el.style.transition = 'transform 1.6s cubic-bezier(.42,0,.58,1), margin-left 1.6s cubic-bezier(.42,0,.58,1), margin-right 1.6s cubic-bezier(.42,0,.58,1)';
            el.style.marginLeft  = marginLeft  + 'px';
            el.style.marginRight = marginRight + 'px';
            el.style.transform   = `rotate(${tilt}deg) translateY(var(--dip, 0px))`;
          }, delay);
        });

        // 2. Pause then sweep back right to center
        const pauseAfter = s(leftDur) + s(300);
        setTimeout(() => {
          if (sequenceStopped) return;
          nudgeTargets.forEach(({ el }) => {
            el.style.transition = 'transform 1.4s cubic-bezier(.22,.9,.2,1), margin-left 1.4s cubic-bezier(.22,.9,.2,1), margin-right 1.4s cubic-bezier(.22,.9,.2,1)';
            el.style.marginLeft  = '';
            el.style.marginRight = '';
            el.style.transform   = '';
          });
          track.style.transition = `transform ${s(SLIDE_DUR)}ms cubic-bezier(.42,0,.58,1)`;
          track.style.transform  = 'translateX(-50%)';
        }, pauseAfter);

        // 3. Open hero as it nears center
        setTimeout(() => {
          if (sequenceStopped) return;
          openBook(books[heroIdx]);
        }, pauseAfter + s(SLIDE_DUR * 0.45));

        // 4. Close
        setTimeout(() => {
          if (sequenceStopped) return;
          closeBook(books[heroIdx]);
        }, pauseAfter + s(SLIDE_DUR * 0.45) + s(900));

        // 5. CTA
        setTimeout(() => {
          if (sequenceStopped) return;
          enterCTAState(books, heroIdx);
        }, pauseAfter + s(SLIDE_DUR * 0.45) + s(2600));

      }, 50);
    }, 50));
  }
}

function openBook(bookEl) {
  if (!bookEl) return;
  bookEl.classList.add('opening', 'opened');
}
function closeBook(bookEl) {
  if (!bookEl) return;
  bookEl.classList.remove('opened');
  setTimeout(() => bookEl.classList.remove('opening'), 1300 / state.speed);
}

function pickNudgeTargets(books, heroIdx) {
  const specs = [
    // Left side
    { offset: -1, tilt: -8.0, delay: 100 },
    { offset: -2, tilt:  5.5, delay: 220 },
    { offset: -3, tilt: -6.5, delay: 320 },
    { offset: -5, tilt:  3.0, delay: 480 },
    // Right side
    { offset:  1, tilt:  7.5, delay: 100 },
    { offset:  2, tilt: -4.5, delay: 240 },
    { offset:  3, tilt:  5.0, delay: 360 },
    { offset:  5, tilt: -2.5, delay: 500 },
  ];

  return specs
    .map(({ offset, tilt, delay }) => {
      const idx = heroIdx + offset;
      if (idx < 0 || idx >= books.length) return null;
      const el = books[idx];
      const origTilt = parseFloat(getComputedStyle(el).getPropertyValue('--tilt')) || 0;
      const finalTilt = origTilt + tilt;
      // A book leaning right (positive tilt) pushes its top-right into the next book → need margin-right
      // A book leaning left (negative tilt) pushes its top-left into the prev book → need margin-left
      // Compute how far the top of the book swings horizontally.
      // transform-origin is bottom-center, so top offset = bookH * sin(angle).
      const bookH = el.offsetHeight;
      const rad   = Math.abs(finalTilt) * Math.PI / 180;
      const topSwing = bookH * Math.sin(rad);
      // Add a small fixed buffer on both sides to prevent any overlap.
      const BUFFER = 6;
      return {
        el,
        tilt: finalTilt,
        marginLeft:  (finalTilt < 0 ? topSwing : 0) + BUFFER,
        marginRight: (finalTilt > 0 ? topSwing : 0) + BUFFER,
        delay,
      };
    })
    .filter(Boolean);
}

function getHeroIdx() {
  return (window.BOOKS[state.palette] || window.BOOKS.editorial).findIndex(b => b.hero);
}

function enterCTAState(books, heroIdx) {
  if (ctaBookEl) {
    ctaBookEl.classList.remove('cta', 'docked');
    const label = ctaBookEl.querySelector('.cta-label');
    if (label) label.remove();
  }
  const target = books[heroIdx] || books[Math.floor(books.length / 2)];
  target.classList.add('cta');
  setTimeout(() => target.classList.add('docked'), 16);

  const label = document.createElement('div');
  label.className = 'cta-label';
  label.textContent = 'Enter library';
  target.appendChild(label);

  let entered = false;
  function handleEnter() {
    if (entered) return;
    entered = true;
    label.innerHTML = 'Opening…';
    target.onclick = null;
    target.classList.remove('docked');
    target.style.animation  = 'none';
    target.style.transition = 'transform 0.8s cubic-bezier(.77,0,.18,1)';
    target.style.transform  = 'translateY(-80px) scale(1.15)';
    target.classList.add('opening', 'opened');
    setTimeout(() => App.showHome(), 700);
  }

  target.onclick = handleEnter;
  label.style.pointerEvents = 'auto';
  label.onclick = (e) => { e.stopPropagation(); handleEnter(); };

  ctaBookEl = target;
}

function runBookPreloadTransition(bookId) {
  clearBookTransitionTimers();
  clearTimers();
  buildShelf(state.palette);
  track.style.transition = 'none';
  track.style.transform = 'translateX(-50%)';

  const books = [...track.querySelectorAll('.book')];
  resetBookStates(books);

  const heroEl = books[getHeroIdx()];
  if (!heroEl) {
    App.show('book', { id: bookId });
    return;
  }

  const T = [];
  bookTransitionTimers = T;
  T.push(setTimeout(() => {
    openBook(heroEl);
  }, 120));
  T.push(setTimeout(() => {
    closeBook(heroEl);
    App.show('book', { id: bookId });
    clearBookTransitionTimers();
  }, 780));
}

function enterPreloader(params = {}) {
  if (params.transitionBookId) {
    runBookPreloadTransition(params.transitionBookId);
    return;
  }
  buildShelf(state.palette);
  runSequence();
}

window.enterPreloader = enterPreloader;

// --- Skip & Replay ------------------------------------------------

document.getElementById('skipBtn').addEventListener('click', () => {
  clearTimers();
  App.showHome();
});

// --- Tweaks -------------------------------------------------------

const tweaksPanel  = document.getElementById('tweaksPanel');
const tweaksToggle = document.getElementById('tweaksToggle');

window.addEventListener('message', (e) => {
  if (!e.data?.type) return;
  if (e.data.type === '__activate_edit_mode')   { tweaksPanel.classList.add('visible');    tweaksToggle.classList.add('visible');    }
  if (e.data.type === '__deactivate_edit_mode') { tweaksPanel.classList.remove('visible'); tweaksToggle.classList.remove('visible'); }
});
window.parent.postMessage({ type: '__edit_mode_available' }, '*');

tweaksToggle.addEventListener('click', () => tweaksPanel.classList.toggle('visible'));

function persist(edits) {
  window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
}

document.getElementById('speedSlider').addEventListener('input', (e) => {
  state.speed = parseFloat(e.target.value);
  document.getElementById('speedNum').textContent = state.speed.toFixed(1) + '×';
  persist({ speed: state.speed });
});
document.getElementById('swingSlider').addEventListener('input', (e) => {
  state.swingIntensity = parseInt(e.target.value);
  document.getElementById('swingNum').textContent = state.swingIntensity + '%';
  persist({ swingIntensity: state.swingIntensity });
});
document.getElementById('themeRow').addEventListener('click', (e) => {
  const sw = e.target.closest('.swatch'); if (!sw) return;
  document.querySelectorAll('#themeRow .swatch').forEach(x => x.classList.remove('active'));
  sw.classList.add('active');
  state.theme = sw.dataset.theme;
  document.getElementById('view-preloader').className = 'theme-' + state.theme;
  persist({ theme: state.theme });
});
document.getElementById('paletteRow').addEventListener('click', (e) => {
  const c = e.target.closest('.chip'); if (!c) return;
  document.querySelectorAll('#paletteRow .chip').forEach(x => x.classList.remove('active'));
  c.classList.add('active');
  state.palette = c.dataset.palette;
  buildShelf(state.palette);
  runSequence();
  persist({ palette: state.palette });
});
function applyDefaults() {
  document.getElementById('speedSlider').value = state.speed;
  document.getElementById('speedNum').textContent = state.speed.toFixed(1) + '×';
  document.getElementById('swingSlider').value = state.swingIntensity;
  document.getElementById('swingNum').textContent = state.swingIntensity + '%';
  document.getElementById('view-preloader').className = 'theme-' + state.theme;
  document.querySelectorAll('#themeRow .swatch').forEach(x => {
    x.classList.toggle('active', x.dataset.theme === state.theme);
  });
  document.querySelectorAll('#paletteRow .chip').forEach(x => {
    x.classList.toggle('active', x.dataset.palette === state.palette);
  });
}

// --- Wordmark link (no-op on preloader, navigation on other views handled by app.js) ---

document.getElementById('preloaderWordmark').addEventListener('click', (e) => {
  e.preventDefault();
});

// --- Init ---------------------------------------------------------

applyDefaults();
buildShelf(state.palette);
setTimeout(runSequence, 400);

let resizeTimer;
let lastW = window.innerWidth;
window.addEventListener('resize', () => {
  if (Math.abs(window.innerWidth - lastW) < 40) return;
  lastW = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { buildShelf(state.palette); runSequence(); }, 300);
});
