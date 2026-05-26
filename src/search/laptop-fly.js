/* ==========================================================================
   Marginalia · Laptop fly-in transition  (v6 — CSS3D screen)
   ─────────────────────────────────────────────────────────────────────────
   The search UI is REAL DOM mounted onto the laptop's screen plane via
   CSS3DRenderer (the same technique the room uses to mount 2D walls onto 3D
   surfaces). Because the CSS3D layer shares the WebGL camera, the search bar
   stays glued to the screen face through every rotation/scale/translation —
   no manual projection, no drift.

   Sequence
   ─────────────────────────────────────────────────────────────────────────
   Act 1 (0–45%)   MacBook zooms forward from the desk, lid rotating to face
                   the camera head-on. The screen lights up; a large search
                   bar (CSS3D, on the screen) types out its placeholder.
   Act 2 (45–80%)  Laptop keeps zooming until the screen fills the viewport.
                   The WebGL laptop body fades out. We freeze the search bar's
                   on-screen rect, navigate (page renders hidden behind overlay).
   Act 3 (handoff) settleLaptopFlyIn() takes the frozen bar (now a plain fixed
                   CSS element) and glides it to the real #shelfSearchInput
                   slot with a glow pulse, then the page fades in around it.

   GLB facts (verified): macbook.glb → Object_0 body/lid, Object_1 keyboard.
   After Three.js load + baseScale=1.5/maxDim and centring, the lid screen
   face sits at world Z≈+0.757, spanning X≈±0.95, lid Y≈-0.61→+0.71.
   ========================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';

const MACBOOK_URL = '/3d/macbook.glb';
const PLACEHOLDER = 'Search your shelf by title, author, or tag';

// Screen face geometry in pivot-local units (verified from GLB).
// Inset well inside the lid bezel so the screen UI never spills past the
// black display area as the laptop scales up.
const SCREEN = {
  width:  1.56,    // world units across the visible display (bezel-inset)
  height: 0.96,    // world units down the visible display
  centerY: 0.12,   // vertical centre of display relative to pivot origin
  z:       0.77,   // front face, a hair proud of the glass
};
// CSS3DObject convention: element pixels map to world units via this divisor.
// element.style.width = (SCREEN.width * PX_PER_UNIT)px, then object scaled 1/PX_PER_UNIT.
const PX_PER_UNIT = 600;

// Pivot scale at the end of Act 1 (laptop framed) and Act 2 (screen fills
// viewport). The bar is counter-scaled by ACT1_END_SCALE/pivotScale during
// Act 2 so the screen grows but the search bar holds a constant size.
const ACT1_END_SCALE = 2.1;
const ACT2_END_SCALE = 4.4;

let activeTransition = null;

function easeOut(t)   { return 1 - Math.pow(1 - t, 3); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function clamp01(v)   { return Math.max(0, Math.min(1, v)); }
function sleep(ms)    { return new Promise((r) => setTimeout(r, ms)); }
function nextFrame()  { return new Promise((r) => requestAnimationFrame(() => r())); }

/* ──────────────────────────────────────────────────────────────────────────
   Act 1 + 2 — the WebGL + CSS3D fly-in. Resolves once the screen fills the
   viewport and we've frozen the search bar's rect. Keeps the overlay alive
   for settleLaptopFlyIn().
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

    /* overlay with two stacked layers: WebGL canvas + CSS3D layer */
    const overlay = document.createElement('div');
    overlay.className = 'laptop-fly-overlay';
    overlay.innerHTML = `
      <div class="laptop-fly-overlay__gl"></div>
      <div class="laptop-fly-overlay__css"></div>
    `;
    document.body.appendChild(overlay);
    const glLayer  = overlay.querySelector('.laptop-fly-overlay__gl');
    const cssLayer = overlay.querySelector('.laptop-fly-overlay__css');

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

    const cssRenderer = new CSS3DRenderer();
    cssRenderer.setSize(w, h);
    cssLayer.appendChild(cssRenderer.domElement);
    cssRenderer.domElement.style.position = 'absolute';
    cssRenderer.domElement.style.inset = '0';
    cssRenderer.domElement.style.pointerEvents = 'none';

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

    /* ── build the CSS3D search-bar element ── */
    const screenEl = document.createElement('div');
    screenEl.className = 'laptop-fly-screen';
    screenEl.style.width  = `${Math.round(SCREEN.width  * PX_PER_UNIT)}px`;
    screenEl.style.height = `${Math.round(SCREEN.height * PX_PER_UNIT)}px`;
    screenEl.innerHTML = `
      <div class="laptop-fly-screen__inner">
        <div class="laptop-fly-screen__bar">
          <svg class="laptop-fly-screen__icon" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <line x1="10.4" y1="10.4" x2="13.6" y2="13.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span class="laptop-fly-screen__text"></span>
          <span class="laptop-fly-screen__caret"></span>
        </div>
      </div>
    `;
    const css3d = new CSS3DObject(screenEl);
    css3d.scale.setScalar(1 / PX_PER_UNIT);
    css3d.position.set(0, SCREEN.centerY, SCREEN.z);
    pivot.add(css3d);

    activeTransition = {
      overlay,
      screenEl,
      textEl: screenEl.querySelector('.laptop-fly-screen__text'),
      caretEl: screenEl.querySelector('.laptop-fly-screen__caret'),
      barEl: screenEl.querySelector('.laptop-fly-screen__bar'),
      renderer,
      cssRenderer,
      raf: 0,
      hardTimeout,
      handoff: null,     // frozen { left, top, width, height } of the bar
      settling: false,
    };

    /* typewriter — types PLACEHOLDER across Act 1 */
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
        cssRenderer.render(scene, camera);
        requestAnimationFrame(() => overlay.classList.add('is-active'));

        const start = performance.now();
        let screenLit  = false;
        let landedFired = false;

        const tick = (now) => {
          const t = clamp01((now - start) / duration);

          if (t <= 0.45) {
            /* Act 1 — zoom in + rotate to face camera */
            const e = easeOut(t / 0.45);
            pivot.scale.setScalar(0.55 + e * (ACT1_END_SCALE - 0.55));
            pivot.position.set(0, -0.22 + e * 0.16, 0);
            pivot.rotation.set(0.16 - e * 0.16, 0.08 - e * 0.08, 0);
            screenEl.style.setProperty('--bar-counter', '1');

            if (!screenLit && t > 0.12) {
              screenLit = true;
              screenEl.classList.add('is-lit');
            }
            // Type placeholder slowly over t=0.16 → 0.60 (≈ 880ms at 2s) —
            // continues a little into Act 2 so the typing reads clearly.
            typeTo((t - 0.16) / 0.44);
          } else if (t <= 0.80) {
            /* Act 2 — the screen grows to fill the viewport, but the search
               bar stays a fixed apparent size. We scale the pivot up (screen
               background fills the screen) and counter-scale the bar by the
               inverse, so only the black screen expands around a steady bar. */
            const e = easeInOut((t - 0.45) / 0.35);
            const pScale = ACT1_END_SCALE + e * (ACT2_END_SCALE - ACT1_END_SCALE);
            pivot.scale.setScalar(pScale);
            pivot.position.set(0, e * 0.02, 0);
            pivot.rotation.set(0, 0, 0);
            // Counter-scale the bar so its on-screen size holds constant.
            screenEl.style.setProperty('--bar-counter', String(ACT1_END_SCALE / pScale));
            typeTo((t - 0.16) / 0.44);

            // Fade laptop body (CSS3D screen stays fully opaque)
            model.traverse((child) => {
              if (!child.isMesh) return;
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach((m) => { m.transparent = true; m.opacity = Math.max(0, 1 - e * 1.3); });
            });

            if (!landedFired && t >= 0.74) {
              landedFired = true;
              freezeBarRect();
              onLanded?.();    // navigate; page renders hidden behind overlay
            }
          } else {
            /* tail — hold while CSS handoff is set up by settleLaptopFlyIn */
            pivot.scale.setScalar(ACT2_END_SCALE);
            screenEl.style.setProperty('--bar-counter', String(ACT1_END_SCALE / ACT2_END_SCALE));
            model.visible = false;     // body fully gone
          }

          pivot.updateMatrixWorld(true);
          renderer.render(scene, camera);
          cssRenderer.render(scene, camera);

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
   Act 3 — settle. Convert the CSS3D bar into a plain fixed element at the
   frozen rect, glide it to the real search slot with a glow, then fade the
   overlay out so the page shows through. Mirrors settleFrameFlyIn().
────────────────────────────────────────────────────────────────────────── */
export async function settleLaptopFlyIn(targetRoot = document) {
  if (!activeTransition || !activeTransition.handoff) {
    cleanup();
    return;
  }
  if (activeTransition.settling) return;
  activeTransition.settling = true;

  // The WebGL/CSS3D renderers are done — tear them down but keep the overlay.
  cleanupRendererOnly();

  const { overlay, handoff } = activeTransition;

  // Find the real search input (the visible bordered box) so we land on its
  // exact rect — not the flex wrapper, which can be wider/taller.
  const realInput = targetRoot.querySelector('.shelf-searchbar input')
    || document.querySelector('.shelf-searchbar input');
  const realBar = realInput?.closest('.shelf-searchbar')
    || targetRoot.querySelector('.shelf-searchbar')
    || document.querySelector('.shelf-searchbar');
  const landEl = (realInput instanceof HTMLElement) ? realInput : realBar;
  if (!(landEl instanceof HTMLElement)) {
    overlay.classList.add('is-finishing');
    await sleep(420);
    cleanup();
    return;
  }

  // Copy the real input's computed look so the ghost ends visually identical:
  // same font, radius, border colour/width, and the same icon/text padding so
  // the icon and placeholder land exactly where the real input draws them.
  const cs = getComputedStyle(landEl);
  const finalFont   = cs.fontSize;
  const finalRadius = cs.borderTopLeftRadius;
  const finalPadL   = cs.paddingLeft;   // real input reserves left space for icon
  const finalPadR   = cs.paddingRight;
  const finalBorder = `${cs.borderTopWidth} solid ${cs.borderTopColor}`;
  const finalColor  = cs.color;
  // The real search icon sits absolutely at this x inside the wrapper.
  const realIcon = (realBar instanceof HTMLElement)
    ? realBar.querySelector('.shelf-searchbar-icon') : null;
  const iconLeft = realIcon ? getComputedStyle(realIcon).left : '16px';

  // Build a ghost that mirrors the real .shelf-searchbar structure: a relative
  // box with an absolutely-positioned icon and left-padded text.
  const ghost = document.createElement('div');
  ghost.className = 'laptop-fly-ghost-bar';
  ghost.innerHTML = `
    <svg class="laptop-fly-ghost-bar__icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <line x1="10.4" y1="10.4" x2="13.6" y2="13.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <span class="laptop-fly-ghost-bar__text">${PLACEHOLDER}</span>
  `;
  ghost.style.left   = `${handoff.left}px`;
  ghost.style.top    = `${handoff.top}px`;
  ghost.style.width  = `${handoff.width}px`;
  ghost.style.height = `${handoff.height}px`;
  overlay.appendChild(ghost);

  // Swap the CSS3D screen out for the flat ghost.
  activeTransition.screenEl?.remove();
  await nextFrame();

  // Measure the real landing slot (the input box).
  const targetRect = landEl.getBoundingClientRect();

  // Glide to the real position AND match its computed look so the settled ghost
  // is the same size/shape as the real search bar (no jump on handoff).
  ghost.style.transition = [
    'left 0.62s cubic-bezier(0.4,0,0.2,1)',
    'top 0.62s cubic-bezier(0.4,0,0.2,1)',
    'width 0.62s cubic-bezier(0.4,0,0.2,1)',
    'height 0.62s cubic-bezier(0.4,0,0.2,1)',
    'font-size 0.62s cubic-bezier(0.4,0,0.2,1)',
    'padding 0.62s cubic-bezier(0.4,0,0.2,1)',
    'border-radius 0.62s cubic-bezier(0.4,0,0.2,1)',
    'border-color 0.62s cubic-bezier(0.4,0,0.2,1)',
  ].join(', ');

  await nextFrame();
  ghost.style.left         = `${targetRect.left}px`;
  ghost.style.top          = `${targetRect.top}px`;
  ghost.style.width        = `${targetRect.width}px`;
  ghost.style.height       = `${targetRect.height}px`;
  ghost.style.fontSize     = finalFont;
  ghost.style.borderRadius = finalRadius;
  ghost.style.border       = finalBorder;
  ghost.style.color        = finalColor;
  ghost.style.paddingLeft  = finalPadL;
  ghost.style.paddingRight = finalPadR;
  // Move the ghost icon to the real icon's x so it aligns with the input.
  const ghostIcon = ghost.querySelector('.laptop-fly-ghost-bar__icon');
  if (ghostIcon instanceof SVGElement) ghostIcon.style.left = iconLeft;

  await sleep(640);

  // Glow pulse on landing.
  ghost.classList.add('is-glowing');
  await sleep(120);

  // Reveal the real page underneath, then fade the overlay out so the page
  // shows through around the now-settled bar. Drop the ghost once the real
  // bar is visible.
  overlay.classList.add('is-finishing');
  await sleep(360);
  ghost.remove();
  await sleep(260);
  cleanup();
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

function cleanup() {
  cleanupRendererOnly();
  activeTransition?.overlay?.remove();
  activeTransition = null;
}

export function cancelLaptopFlyIn() {
  cleanup();
}
