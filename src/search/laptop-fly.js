/* ==========================================================================
   Marginalia · Laptop fly-in transition  (v4)
   ─────────────────────────────────────────────────────────────────────────
   MacBook GLB analysis (macbook.glb):
     Object_0  — full laptop body + lid   Y: 0–22.1  Z: ±11.165
     Object_1  — keyboard/base slab       Y: 0.14–0.9  Z: ±11.165
   Both share one material; there is no separate screen mesh.

   Strategy: compute the screen rect analytically from Object_0's world
   bounding box. The screen occupies the upper ~78% of the lid face
   (front face in model space = max Z), with a 5% bezel inset on all sides.
   We project four world-space corners every rAF frame and position a CSS div
   on top — so the search UI is always glued to the screen face as the laptop
   zooms in. When the screen fills the viewport the bar is already in place.
   ========================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MACBOOK_URL = '/3d/macbook.glb';

// Model-space constants derived from GLB accessor min/max
const MODEL = {
  xMin: -15.5,
  xMax:  15.5,
  yMin:   0,
  yMax:  22.12,
  zFront: 11.165,   // front face of lid (faces camera after normalisation)
  // Keyboard slab occupies Y 0–0.9 → lid starts above that
  lidBaseY: 1.2,    // world model Y where lid begins
};
// Screen bezel inset (fraction of lid dimensions)
const BEZEL = { x: 0.07, top: 0.06, bottom: 0.08 };

/**
 * @param {object}   [opts]
 * @param {number}   [opts.duration=1900]
 * @param {Function} [opts.onLanded]  navigate here — called while overlay covers page
 */
export function playLaptopFlyIn(opts = {}) {
  const duration = opts.duration ?? 1900;
  const onLanded = typeof opts.onLanded === 'function' ? opts.onLanded : null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (teardown) => {
      if (settled) return;
      settled = true;
      teardown?.();
      resolve();
    };

    const hardTimeout = setTimeout(() => finish(), duration + 1500);

    /* ── overlay ── */
    const overlay = document.createElement('div');
    overlay.className = 'laptop-fly-overlay';
    document.body.appendChild(overlay);

    const w = window.innerWidth;
    const h = window.innerHeight;

    /* ── WebGL renderer ── */
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      overlay.remove();
      clearTimeout(hardTimeout);
      finish();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    overlay.appendChild(renderer.domElement);

    /* ── scene ── */
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 100);
    camera.position.set(0, 0, 4.8);

    const keyLight = new THREE.DirectionalLight(0xfff0e0, 1.8);
    keyLight.position.set(2, 3, 4);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9fb0c4, 0.45);
    fillLight.position.set(-3, -1, -2);
    scene.add(fillLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const pivot = new THREE.Group();
    scene.add(pivot);

    /* ── screen UI div (repositioned every frame) ── */
    const screenUI = document.createElement('div');
    screenUI.className = 'laptop-fly-screen-ui';
    screenUI.innerHTML = `
      <div class="laptop-fly-screen-ui__searchbar">
        <svg class="laptop-fly-screen-ui__icon" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.3" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <line x1="10.3" y1="10.3" x2="13.5" y2="13.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <span class="laptop-fly-screen-ui__placeholder">Search your shelf by title, author, or tag</span>
      </div>
      <div class="laptop-fly-screen-ui__chips">
        <span class="laptop-fly-screen-ui__chip is-active">All</span>
        <span class="laptop-fly-screen-ui__chip">Finished</span>
        <span class="laptop-fly-screen-ui__chip">Reading</span>
        <span class="laptop-fly-screen-ui__chip">To Read</span>
      </div>
    `;
    document.body.appendChild(screenUI);

    /* ── project the four screen-face corners to CSS pixels ─────────────
       We define the screen corners in model space (pre-normalisation scale
       applied later via pivot.matrixWorld). After the model is loaded we
       compute a baseScale factor; these unit-space fractions get multiplied
       by baseScale every frame via worldToScreen which uses pivot.matrixWorld.
    ─────────────────────────────────────────────────────────────────────── */
    let baseScale = 1;

    // Screen corners in original model units (before baseScale):
    // X: inset by BEZEL.x from each side
    // Y: lid base + BEZEL.top … yMax - BEZEL.bottom (in fraction of height)
    function getScreenCornersModel() {
      const xInset = (MODEL.xMax - MODEL.xMin) * BEZEL.x;
      const yRange = MODEL.yMax - MODEL.lidBaseY;
      const xl = MODEL.xMin + xInset;
      const xr = MODEL.xMax - xInset;
      const yb = MODEL.lidBaseY + yRange * BEZEL.bottom;
      const yt = MODEL.yMax   - yRange * BEZEL.top;
      const z  = MODEL.zFront;
      return [
        new THREE.Vector3(xl, yb, z),
        new THREE.Vector3(xr, yb, z),
        new THREE.Vector3(xl, yt, z),
        new THREE.Vector3(xr, yt, z),
      ];
    }

    // Project a model-space point through pivot's current world matrix + camera
    function modelToScreen(modelPt) {
      // Apply baseScale (the model's own normalisation), then pivot transform
      const scaled = modelPt.clone().multiplyScalar(baseScale);
      scaled.applyMatrix4(pivot.matrixWorld);
      scaled.project(camera);
      return {
        x: ( scaled.x * 0.5 + 0.5) * w,
        y: (-scaled.y * 0.5 + 0.5) * h,
      };
    }

    function projectScreenRect() {
      const corners  = getScreenCornersModel().map(modelToScreen);
      const xs = corners.map((p) => p.x);
      const ys = corners.map((p) => p.y);
      const rx = Math.min(...xs), ry = Math.min(...ys);
      return { x: rx, y: ry, w: Math.max(...xs) - rx, h: Math.max(...ys) - ry };
    }

    function syncScreenUI() {
      const r = projectScreenRect();
      screenUI.style.left   = r.x + 'px';
      screenUI.style.top    = r.y + 'px';
      screenUI.style.width  = r.w + 'px';
      screenUI.style.height = r.h + 'px';
      // Font size: scale with screen width so text fills the div naturally
      const fs = Math.max(9, r.w * 0.028);
      screenUI.style.setProperty('--lf-fs', fs + 'px');
    }

    const easeOut   = (t) => 1 - Math.pow(1 - t, 3);
    const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    let raf = null;
    const teardown = () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(hardTimeout);
      renderer.domElement?.remove();
      renderer.dispose();
      overlay.remove();
      screenUI.remove();
    };

    /* ── load GLB ── */
    const loader = new GLTFLoader();
    loader.load(
      MACBOOK_URL,
      (gltf) => {
        const model = gltf.scene;

        // Normalise: fit largest dimension to 1.5 units
        const box    = new THREE.Box3().setFromObject(model);
        const span   = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(span.x, span.y, span.z) || 1;
        baseScale    = 1.5 / maxDim;
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(baseScale);
        model.scale.setScalar(baseScale);
        model.position.sub(center);
        pivot.add(model);

        // Starting pose: small, slight tilt, slight offset down
        pivot.scale.setScalar(0.55);
        pivot.position.set(0, -0.24, 0);
        pivot.rotation.set(0.18, 0.08, 0);

        // Render one frame, then darken overlay (room stays visible until now)
        pivot.updateMatrixWorld(true);
        renderer.render(scene, camera);
        requestAnimationFrame(() => overlay.classList.add('is-active'));

        // Position screen UI immediately (before is-visible so it's already
        // in the right spot when it fades in)
        pivot.updateMatrixWorld(true);
        syncScreenUI();

        const start = performance.now();
        let screenShown = false;
        let landedFired = false;
        let bodyFading  = false;

        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);

          /* ── Phase A (0–58%): zoom MacBook in ── */
          if (t <= 0.58) {
            const e = easeOut(t / 0.58);
            pivot.scale.setScalar(0.55 + e * 2.35);     // 0.55 → 2.9
            pivot.position.set(0, -0.24 + e * 0.20, 0);
            pivot.rotation.set(0.18 - e * 0.22, 0.08 - e * 0.08, 0);

            // Show screen UI once it's big enough to read
            if (t > 0.22 && !screenShown) {
              screenShown = true;
              screenUI.classList.add('is-visible');
            }
          }

          /* ── Phase B (58–84%): body fades, screen stays, nav fires ── */
          if (t > 0.58 && t <= 0.84) {
            const e = (t - 0.58) / 0.26;
            // Keep zooming slightly
            pivot.scale.setScalar(2.9 + easeInOut(e) * 0.5);
            pivot.position.set(0, -0.04, 0);
            pivot.rotation.set(-0.04, 0, 0);

            if (!bodyFading) {
              bodyFading = true;
              // Mark body meshes for fading (applied each frame below)
            }
            // Fade all laptop geometry
            model.traverse((child) => {
              if (!child.isMesh) return;
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach((m) => {
                m.transparent = true;
                m.opacity = Math.max(0, 1 - easeInOut(e));
              });
            });

            if (!landedFired && t >= 0.78) {
              landedFired = true;
              onLanded?.();
            }
          }

          /* ── Phase C (84–100%): fade overlay out ── */
          if (t > 0.84) {
            if (!landedFired) { landedFired = true; onLanded?.(); }
            const e = (t - 0.84) / 0.16;
            overlay.style.opacity  = String(1 - easeInOut(e));
            screenUI.style.opacity = String(1 - easeInOut(e));
          }

          // Update pivot world matrix so projection is accurate
          pivot.updateMatrixWorld(true);

          // Reposition screen UI every frame during Phases A + B
          if (t <= 0.84) syncScreenUI();

          renderer.render(scene, camera);

          if (t < 1) {
            raf = requestAnimationFrame(tick);
          } else {
            if (!landedFired) { landedFired = true; onLanded?.(); }
            setTimeout(() => finish(teardown), 100);
          }
        };

        raf = requestAnimationFrame(tick);
      },
      undefined,
      () => { finish(teardown); },
    );
  });
}
