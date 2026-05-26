/* ==========================================================================
   Marginalia · Laptop fly-in transition  (v7 — flat overlay bar)
   ─────────────────────────────────────────────────────────────────────────
   The WebGL laptop and the search bar live on two separate layers:
     • a WebGL canvas renders/animates the MacBook (fly out → freeze → zoom);
     • a FLAT fixed-position search bar is drawn on TOP of it (override layer).
   The bar is NOT mapped onto the 3D screen plane — it's an ordinary DOM
   element centred over the screen region. It holds a single constant size the
   entire time (it never scales with the laptop zoom), and it is the very same
   element that later flies to the real Search page slot. One bar, start to
   finish — so there is never a size/position mismatch or a second ghost.

   Sequence (sequential beats — see the phase constants below)
   ─────────────────────────────────────────────────────────────────────────
   Act 1   MacBook flies out of the desk, lid rotating to face the camera
           head-on, and SETTLES at a framed pose. Screen dark; no bar yet.
   Freeze  Laptop holds perfectly still. The flat bar fades in over the lit
           screen and types its placeholder, char by char. The bar only ever
           appears on a stationary laptop — no moving-body overlap / ghosting.
   Act 3   Text complete. The laptop keeps zooming until its lit screen fills
           the viewport; the WebGL body fades out. The bar stays the same size
           the whole time. We navigate (page renders hidden behind the overlay).
   Handoff settleLaptopFlyIn() keeps the bar's SIZE fixed and glides it (frame
           fading away) so its "Search your shelf…" line settles into the real
           #shelfSearchInput's text position. The real input's own glowing
           border then appears, our line fades, and the page reveals around it.

   GLB facts (verified): macbook.glb → Object_0 body/lid, Object_1 keyboard.
   ========================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MACBOOK_URL = '/3d/macbook.glb';
const PLACEHOLDER = 'Search your shelf by title, author, or tag';

// Pivot scale at the end of Act 1 (laptop framed) and Act 3 (screen fills
// viewport). The bar is counter-scaled by FRAMED_SCALE/pivotScale during the
// fill beat so the screen grows but the search bar holds a constant size.
const FRAMED_SCALE = 2.1;     // laptop framed, facing camera (Act 1 end)
const FULLSCREEN_SCALE = 4.4; // screen fills viewport (Act 3 end)
const SEARCH_VIEW_ID = 'view-search';
const SEARCH_STAGE_CLASS = 'is-laptop-transition';
const SEARCH_BAR_LIVE_CLASS = 'is-laptop-transition-bar-live';
const SEARCH_REVEAL_CLASS = 'is-laptop-transition-revealing';

let activeTransition = null;

/* ── Timeline phases (fractions of `duration`) ───────────────────────────────
   Sequential, non-overlapping beats so each reads as a distinct moment:
     0    → FLY_END   : laptop flies out of the room + rotates to face camera.
     FLY_END → LIT    : laptop FROZEN; screen wakes from dark to lit (no text).
     LIT  → TYPE_END  : laptop FROZEN; placeholder types out, char by char.
     TYPE_END → FILL  : text done & bar held; laptop zooms until screen fills.
     FILL → 1         : tail hold while the CSS handoff is wired up.
   The freeze (FLY_END → TYPE_END) is the key beat: the bar only appears after
   the laptop has fully settled, so there is never a moving-laptop + bar overlap. */
const FLY_END  = 0.34;  // laptop reaches framed pose, fully still
const LIT      = 0.42;  // screen finished waking; typing may begin
const TYPE_END = 0.66;  // placeholder fully typed
const FILL     = 0.90;  // screen has filled the viewport

function easeOut(t)   { return 1 - Math.pow(1 - t, 3); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function clamp01(v)   { return Math.max(0, Math.min(1, v)); }
function sleep(ms)    { return new Promise((r) => setTimeout(r, ms)); }
function nextFrame()  { return new Promise((r) => requestAnimationFrame(() => r())); }

function getSearchView(targetRoot = document) {
  if (targetRoot instanceof Document) return targetRoot.getElementById(SEARCH_VIEW_ID);
  return targetRoot.querySelector?.(`#${SEARCH_VIEW_ID}`) || document.getElementById(SEARCH_VIEW_ID);
}

function clearSearchTransitionState(targetRoot = document) {
  const view = getSearchView(targetRoot);
  if (!(view instanceof HTMLElement)) return;
  view.classList.remove(SEARCH_STAGE_CLASS, SEARCH_BAR_LIVE_CLASS, SEARCH_REVEAL_CLASS);
}

function stageSearchTransitionState(targetRoot = document) {
  const view = getSearchView(targetRoot);
  if (!(view instanceof HTMLElement)) return null;
  view.classList.add(SEARCH_STAGE_CLASS);
  view.classList.remove(SEARCH_BAR_LIVE_CLASS, SEARCH_REVEAL_CLASS);
  return view;
}

/* ──────────────────────────────────────────────────────────────────────────
   Acts 1–3 — the WebGL laptop fly-in + flat-bar typing. Resolves once the
   screen fills the viewport and we've frozen the search bar's rect. Keeps the
   overlay (and the bar) alive for settleLaptopFlyIn().
────────────────────────────────────────────────────────────────────────── */
export function playLaptopFlyIn(opts = {}) {
  const duration = opts.duration ?? 2000;
  const onLanded = typeof opts.onLanded === 'function' ? opts.onLanded : null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (keepOverlay) => {
      if (settled) return;
      settled = true;
      if (!keepOverlay) cleanup();
      else cleanupRendererOnly();
      resolve();
    };

    const hardTimeout = setTimeout(() => finish(false), duration + 1600);

    /* overlay with two stacked layers: WebGL laptop + a FLAT bar overlay.
       The search bar is a plain fixed element drawn on top of the laptop
       (not mapped onto the 3D screen) — it holds a constant size through the
       whole zoom and is the very element that later flies to the real slot. */
    const overlay = document.createElement('div');
    overlay.className = 'laptop-fly-overlay';
    overlay.innerHTML = `
      <div class="laptop-fly-overlay__gl"></div>
      <div class="laptop-fly-overlay__ui"></div>
    `;
    document.body.appendChild(overlay);
    const glLayer = overlay.querySelector('.laptop-fly-overlay__gl');
    const uiLayer = overlay.querySelector('.laptop-fly-overlay__ui');

    const w = window.innerWidth;
    const h = window.innerHeight;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      overlay.remove();
      clearTimeout(hardTimeout);
      resolve();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    glLayer.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 100);
    camera.position.set(0, 0, 4.8);

    const keyLight = new THREE.DirectionalLight(0xfff0e0, 1.9);
    keyLight.position.set(2, 3, 4);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9fb0c4, 0.5);
    fillLight.position.set(-3, -1, -2);
    scene.add(fillLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const pivot = new THREE.Group();
    scene.add(pivot);

    /* ── build the FLAT search-bar element (fixed overlay, constant size) ──
       Width is a fixed fraction of the viewport, clamped, and centred over the
       laptop's screen region. It never scales while the laptop zooms — only the
       handoff glide changes its transform. */
    const barWidth = Math.round(Math.min(640, Math.max(380, w * 0.46)));
    const barEl = document.createElement('div');
    barEl.className = 'laptop-fly-bar';
    barEl.style.width = `${barWidth}px`;
    barEl.style.left = `${Math.round(w / 2 - barWidth / 2)}px`;
    // Sit in the upper-middle of the screen, clearly inside the lit display.
    barEl.style.top = `${Math.round(h * 0.34)}px`;
    barEl.innerHTML = `
      <svg class="laptop-fly-bar__icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <line x1="10.4" y1="10.4" x2="13.6" y2="13.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <div class="laptop-fly-bar__field">
        <span class="laptop-fly-bar__text"></span>
        <span class="laptop-fly-bar__caret"></span>
      </div>
    `;
    uiLayer.appendChild(barEl);

    activeTransition = {
      overlay,
      barEl,
      textEl: barEl.querySelector('.laptop-fly-bar__text'),
      caretEl: barEl.querySelector('.laptop-fly-bar__caret'),
      renderer,
      cssRenderer: null,
      raf: 0,
      hardTimeout,
      handoff: null,     // frozen { left, top, width, height } of the bar
      settling: false,
    };

    /* typewriter — types PLACEHOLDER across the frozen beat (LIT → TYPE_END) */
    let typed = 0;
    function typeTo(fraction) {
      const target = Math.round(PLACEHOLDER.length * clamp01(fraction));
      if (target === typed) return;
      typed = target;
      activeTransition.textEl.textContent = PLACEHOLDER.slice(0, typed);
    }

    /* project the bar element's on-screen rect (for the CSS handoff) */
    function freezeBarRect() {
      const bar = activeTransition.barEl;
      if (!bar) return;
      const r = bar.getBoundingClientRect();
      activeTransition.handoff = {
        left: r.left, top: r.top, width: r.width, height: r.height,
      };
    }

    const loader = new GLTFLoader();
    loader.load(
      MACBOOK_URL,
      (gltf) => {
        const model = gltf.scene;
        const box    = new THREE.Box3().setFromObject(model);
        const span   = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(span.x, span.y, span.z) || 1;
        const scale  = 1.5 / maxDim;
        const center = box.getCenter(new THREE.Vector3());
        model.scale.setScalar(scale);
        model.position.copy(center).multiplyScalar(-scale);
        pivot.add(model);

        // initial pose: small, tilted slightly down/away
        pivot.scale.setScalar(0.55);
        pivot.position.set(0, -0.22, 0);
        pivot.rotation.set(0.16, 0.08, 0);

        pivot.updateMatrixWorld(true);
        renderer.render(scene, camera);
        requestAnimationFrame(() => overlay.classList.add('is-active'));

        const start = performance.now();
        let barShown = false;
        let landedFired = false;

        // Pose the laptop holds during the entire freeze beat (FLY_END → TYPE_END).
        const setFramedPose = () => {
          pivot.scale.setScalar(FRAMED_SCALE);
          pivot.position.set(0, -0.06, 0);
          pivot.rotation.set(0, 0, 0);
        };

        const tick = (now) => {
          const t = clamp01((now - start) / duration);

          if (t <= FLY_END) {
            /* Act 1 — laptop flies out of the room and rotates to face the
               camera. No search bar yet. */
            const e = easeOut(t / FLY_END);
            pivot.scale.setScalar(0.55 + e * (FRAMED_SCALE - 0.55));
            pivot.position.set(0, -0.22 + e * 0.16, 0);
            pivot.rotation.set(0.16 - e * 0.16, 0.08 - e * 0.08, 0);
          } else if (t <= TYPE_END) {
            /* Freeze beat — laptop is perfectly still at the framed pose. The
               flat bar fades in over the screen (FLY_END → LIT), then the
               placeholder types out (LIT → TYPE_END). The laptop does not
               move, so the bar never overlaps a moving body. */
            setFramedPose();

            if (!barShown && t >= FLY_END) {
              barShown = true;
              barEl.classList.add('is-shown');   // fade the bar in (CSS)
            }
            typeTo((t - LIT) / (TYPE_END - LIT));
          } else if (t <= FILL) {
            /* Act 3 — text done; the laptop zooms in until its screen fills the
               viewport. The bar is a separate flat overlay and is NOT touched
               here, so it holds a perfectly constant size while the laptop
               grows behind it — reads as the screen pushing toward you. */
            typeTo(1);
            const e = easeInOut((t - TYPE_END) / (FILL - TYPE_END));
            const pScale = FRAMED_SCALE + e * (FULLSCREEN_SCALE - FRAMED_SCALE);
            pivot.scale.setScalar(pScale);
            pivot.position.set(0, -0.06 + e * 0.06, 0);
            pivot.rotation.set(0, 0, 0);

            // Fade the laptop body out so we end on a clean dark field carrying
            // just the search bar.
            model.traverse((child) => {
              if (!child.isMesh) return;
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach((m) => { m.transparent = true; m.opacity = Math.max(0, 1 - e * 1.3); });
            });

            if (!landedFired && t >= FILL - 0.05) {
              landedFired = true;
              freezeBarRect();
              onLanded?.();    // navigate; page renders hidden behind overlay
            }
          } else {
            /* tail — hold while the handoff is set up by settleLaptopFlyIn */
            typeTo(1);
            pivot.scale.setScalar(FULLSCREEN_SCALE);
            model.visible = false;     // body fully gone
          }

          pivot.updateMatrixWorld(true);
          renderer.render(scene, camera);

          if (t < 1) {
            activeTransition.raf = requestAnimationFrame(tick);
          } else {
            if (!landedFired) { landedFired = true; freezeBarRect(); onLanded?.(); }
            finish(true);   // keep overlay; settle() takes over
          }
        };

        activeTransition.raf = requestAnimationFrame(tick);
      },
      undefined,
      () => { finish(false); },
    );
  });
}

/* ──────────────────────────────────────────────────────────────────────────
   Handoff — settle. Glide the same flat bar from its frozen rect onto the real
   search slot (scaling to land exactly on top), pulse a glow, then fade the
   overlay out so the page shows through. Mirrors settleFrameFlyIn().
────────────────────────────────────────────────────────────────────────── */
export async function settleLaptopFlyIn(targetRoot = document) {
  if (!activeTransition || !activeTransition.handoff) {
    cleanup();
    return;
  }
  if (activeTransition.settling) return;
  activeTransition.settling = true;

  // The WebGL renderer is done — tear it down but keep the overlay + the bar.
  cleanupRendererOnly();

  const { overlay, handoff, barEl } = activeTransition;
  const view = stageSearchTransitionState(targetRoot);

  // Land exactly on the real search bar's rect.
  const realBar = targetRoot.querySelector('.shelf-searchbar')
    || document.querySelector('.shelf-searchbar');
  if (!(realBar instanceof HTMLElement) || !barEl) {
    overlay.classList.add('is-finishing');
    await sleep(420);
    cleanup();
    return;
  }

  const targetRect = realBar.getBoundingClientRect();

  // Keep the bar's SIZE unchanged. Instead, glide the whole bar (so its
  // "Search your shelf…" line travels) until that line lands on the real
  // input's text position. The bar's left-padding (42px) and font (13px mono)
  // already match the real input, so a pure translate — no scale — lands the
  // text exactly. We drop the bar's own frame during the glide so only the
  // text appears to settle in, then the real input's glowing border takes over.
  barEl.classList.add('is-flying');
  barEl.style.transformOrigin = 'top left';

  // Vertically align the text baselines: both bar and input are the same
  // height, so matching their tops aligns the centred text too.
  const dx = targetRect.left - handoff.left;
  const dy = (targetRect.top + targetRect.height / 2)
    - (handoff.top + handoff.height / 2);

  await nextFrame();
  barEl.style.transition =
    'transform 0.66s cubic-bezier(0.22, 1, 0.36, 1)';
  await nextFrame();
  // Fade the bar's frame (border + fill) out as it travels; only the text /
  // icon ride along. The line lands in place rather than popping in.
  barEl.classList.add('is-frameless');
  barEl.style.transform = `translate(${dx}px, ${dy}px)`;

  await sleep(660);

  // The real input's own glowing border appears underneath, exactly where the
  // text just landed (SEARCH_BAR_LIVE_CLASS uses the Search page's border/glow).
  if (view) view.classList.add(SEARCH_BAR_LIVE_CLASS);
  await sleep(220);

  // Hand the text off to the real (empty) input: fade our travelling text out
  // as the page content reveals around the now-glowing bar.
  overlay.classList.add('is-finishing');
  if (view) view.classList.add(SEARCH_REVEAL_CLASS);
  barEl.style.transition = 'opacity 0.32s ease';
  barEl.style.opacity = '0';
  await sleep(340);
  barEl.remove();
  cleanup({ preserveSearchState: true });
  await sleep(900);
  clearSearchTransitionState(targetRoot);
}

/* Poll for the search slot, then settle (mirrors maybeSettleFrameFlyIn). */
export function maybeSettleLaptopFlyIn(targetRoot = document) {
  if (!activeTransition) return;
  let attempts = 0;
  const tick = () => {
    if (!activeTransition) return;
    const target = targetRoot.querySelector('.shelf-searchbar')
      || document.querySelector('.shelf-searchbar');
    if (target instanceof HTMLElement && target.getBoundingClientRect().width > 0) {
      settleLaptopFlyIn(targetRoot);
      return;
    }
    attempts += 1;
    if (attempts > 60) { cleanup(); return; }
    setTimeout(tick, 40);
  };
  tick();
}

/* ── teardown ── */
function cleanupRendererOnly() {
  if (!activeTransition) return;
  const a = activeTransition;
  if (a.raf) cancelAnimationFrame(a.raf);
  if (a.hardTimeout) clearTimeout(a.hardTimeout);
  a.renderer?.domElement?.remove();
  a.renderer?.dispose?.();
  a.cssRenderer?.domElement?.remove();
  a.renderer = null;
  a.cssRenderer = null;
}

function cleanup({ preserveSearchState = false } = {}) {
  cleanupRendererOnly();
  activeTransition?.overlay?.remove();
  activeTransition = null;
  if (!preserveSearchState) clearSearchTransitionState(document);
}

export function cancelLaptopFlyIn() {
  cleanup();
}
