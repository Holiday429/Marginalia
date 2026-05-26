/* ==========================================================================
   Marginalia · Laptop fly-in transition  (v5)
   ─────────────────────────────────────────────────────────────────────────
   MacBook GLB geometry (verified from accessor min/max + node matrices):
     Node0 (Sketchfab_model) + Node2 (GLTF_SceneRootNode) apply axis
     rotations that cancel. Node4 (PROD-34805_1) applies scale 0.01.
     Two meshes: Object_0 = full body/lid, Object_1 = keyboard slab.

   After Three.js loads the GLB and we apply baseScale = 1.5/maxDim:
     World bounds (centred):  X ±1.051  Y -0.75→+0.75  Z ±0.757
     Keyboard slab top:       Y ≈ -0.689
     Screen face (front):     Z = +0.757

   We compute screen corners in LOCAL pivot space (after centering) and
   project them through pivot.matrixWorld + camera every frame. This means
   the screenUI div always matches the 3D screen face exactly regardless of
   the pivot's scale/rotation/position.
   ========================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MACBOOK_URL = '/3d/macbook.glb';

// Screen corners in pivot-local space (verified world coords after centering).
// These are constant — the pivot transform handles all animation.
// Bezel inset: 8% sides, 5% top, 6% bottom of screen area.
const LID_Y_BOTTOM = -0.689;  // top of keyboard slab = lid base
const LID_Y_TOP    =  0.750;  // top of lid
const SCR_X_HALF   =  1.051;  // half-width of laptop
const SCR_Z        =  0.757;  // front face Z

const BEZ_X   = 0.10;  // bezel inset fraction of half-width
const BEZ_TOP = 0.05;  // fraction of lid height from top
const BEZ_BOT = 0.12;  // fraction of lid height from bottom

function makeScreenCorners() {
  const lidH  = LID_Y_TOP - LID_Y_BOTTOM;
  const xl    = -SCR_X_HALF * (1 - BEZ_X);
  const xr    =  SCR_X_HALF * (1 - BEZ_X);
  const yb    = LID_Y_BOTTOM + lidH * BEZ_BOT;
  const yt    = LID_Y_TOP    - lidH * BEZ_TOP;
  return [
    new THREE.Vector3(xl, yb, SCR_Z),  // bottom-left
    new THREE.Vector3(xr, yb, SCR_Z),  // bottom-right
    new THREE.Vector3(xl, yt, SCR_Z),  // top-left
    new THREE.Vector3(xr, yt, SCR_Z),  // top-right
  ];
}

/**
 * @param {object}   [opts]
 * @param {number}   [opts.duration=1900]
 * @param {Function} [opts.onLanded]  — navigate while overlay still covers page
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

    const vw = window.innerWidth;
    const vh = window.innerHeight;

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
    renderer.setSize(vw, vh);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    overlay.appendChild(renderer.domElement);

    /* ── scene ── */
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, vw / vh, 0.1, 100);
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

    /* ── screen-tracking UI div ── */
    const screenUI = document.createElement('div');
    screenUI.className = 'laptop-fly-screen-ui';
    screenUI.innerHTML = `
      <div class="laptop-fly-screen-ui__bar">
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

    /* ── projection helpers ── */
    const _tmp = new THREE.Vector3();

    // Project one pivot-local point to CSS {x,y}
    function projectPt(localPt) {
      _tmp.copy(localPt).applyMatrix4(pivot.matrixWorld).project(camera);
      return {
        x: ( _tmp.x * 0.5 + 0.5) * vw,
        y: (-_tmp.y * 0.5 + 0.5) * vh,
      };
    }

    const screenCorners = makeScreenCorners();

    function syncScreenUI() {
      const pts = screenCorners.map(projectPt);
      const xs  = pts.map((p) => p.x);
      const ys  = pts.map((p) => p.y);
      const rx  = Math.min(...xs);
      const ry  = Math.min(...ys);
      const rw  = Math.max(...xs) - rx;
      const rh  = Math.max(...ys) - ry;

      screenUI.style.left   = rx + 'px';
      screenUI.style.top    = ry + 'px';
      screenUI.style.width  = rw + 'px';
      screenUI.style.height = rh + 'px';

      // Font size proportional to screen width — all spacing is in em so it scales
      const fs = Math.max(8, rw * 0.032);
      screenUI.style.setProperty('--lf-fs', fs + 'px');
    }

    /* ── easing ── */
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

    /* ── load MacBook GLB ── */
    const loader = new GLTFLoader();
    loader.load(
      MACBOOK_URL,
      (gltf) => {
        const model = gltf.scene;

        // Three.js normalises the GLB to world space automatically.
        // Fit the largest dimension to 1.5 units.
        const box    = new THREE.Box3().setFromObject(model);
        const span   = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(span.x, span.y, span.z) || 1;
        const scale  = 1.5 / maxDim;
        const center = box.getCenter(new THREE.Vector3());

        model.scale.setScalar(scale);
        model.position.copy(center).multiplyScalar(-scale);
        pivot.add(model);

        // Starting pose: small, slight tilt down
        pivot.scale.setScalar(0.55);
        pivot.position.set(0, -0.24, 0);
        pivot.rotation.set(0.18, 0.08, 0);

        // Render first frame, then darken overlay (room stays visible, no flash)
        pivot.updateMatrixWorld(true);
        renderer.render(scene, camera);
        requestAnimationFrame(() => overlay.classList.add('is-active'));

        // Pre-sync UI position before making it visible
        pivot.updateMatrixWorld(true);
        syncScreenUI();

        const start = performance.now();
        let uiShown   = false;
        let landedFired = false;

        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);

          /* Phase A (0–58%): zoom laptop in */
          if (t <= 0.58) {
            const e = easeOut(t / 0.58);
            pivot.scale.setScalar(0.55 + e * 2.35);
            pivot.position.set(0, -0.24 + e * 0.20, 0);
            pivot.rotation.set(0.18 - e * 0.22, 0.08 - e * 0.08, 0);

            // Show UI once screen is wide enough to read text
            if (!uiShown && t > 0.20) {
              uiShown = true;
              screenUI.classList.add('is-visible');
            }
          }

          /* Phase B (58–84%): laptop body fades, screen keeps growing */
          if (t > 0.58 && t <= 0.84) {
            const e = (t - 0.58) / 0.26;
            pivot.scale.setScalar(2.9 + easeInOut(e) * 0.5);
            pivot.position.set(0, -0.04, 0);
            pivot.rotation.set(-0.04, 0, 0);

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

          /* Phase C (84–100%): fade overlay + UI out */
          if (t > 0.84) {
            if (!landedFired) { landedFired = true; onLanded?.(); }
            const e = (t - 0.84) / 0.16;
            const alpha = 1 - easeInOut(e);
            overlay.style.opacity  = String(alpha);
            screenUI.style.opacity = String(alpha);
          }

          // Always update world matrix before projecting
          pivot.updateMatrixWorld(true);

          // Reposition screen UI every frame (Phases A + B only)
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
