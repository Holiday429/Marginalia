/* ==========================================================================
   Marginalia · Laptop fly-in transition  (v3)
   ─────────────────────────────────────────────────────────────────────────
   The MacBook zooms from desk scale toward the camera until its screen fills
   the viewport. A search-bar UI lives inside a CSS div that is repositioned
   every rAF frame to match the projected screen rect — so the UI tracks the
   3D screen exactly as it grows. When the screen covers the whole window the
   search bar is already sitting in its real position, and the real Search
   page fades in behind the overlay.

   Phases
   ─────────────────────────────────────────────────────────────────────────
   A (0–55%)   MacBook zooms forward; laptop body fills screen.
               Screen UI div tracks the 3D rect every frame.
   B (55–85%)  Laptop bezel / body fade out. Screen div keeps growing.
               At t=0.78 the screen rect ≈ covers viewport → onLanded.
   C (85–100%) Overlay fades out revealing real Search page underneath.
               Screen div stays fixed so search bar appears to "land".
   ========================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MACBOOK_URL = '/3d/macbook.glb';

/**
 * @param {object}   [opts]
 * @param {number}   [opts.duration=1800]
 * @param {Function} [opts.onLanded]  — navigate here (called while overlay still covers page)
 */
export function playLaptopFlyIn(opts = {}) {
  const duration  = opts.duration  ?? 1800;
  const onLanded  = typeof opts.onLanded === 'function' ? opts.onLanded : null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (teardown) => {
      if (settled) return;
      settled = true;
      teardown?.();
      resolve();
    };

    const hardTimeout = setTimeout(() => finish(), duration + 1500);

    /* ── root overlay ─────────────────────────────────────────────────── */
    const overlay = document.createElement('div');
    overlay.className = 'laptop-fly-overlay';
    document.body.appendChild(overlay);

    const w = window.innerWidth;
    const h = window.innerHeight;

    /* ── WebGL renderer ───────────────────────────────────────────────── */
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

    /* ── scene ────────────────────────────────────────────────────────── */
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 100);
    camera.position.set(0, 0, 4.8);

    const key  = new THREE.DirectionalLight(0xfff0e0, 1.8);
    key.position.set(2, 3, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb0c4, 0.45);
    fill.position.set(-3, -1, -2);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const pivot = new THREE.Group();
    scene.add(pivot);

    /* ── screen-tracking UI div ───────────────────────────────────────── */
    // This div is positioned every frame to match the projected screen rect.
    // It contains the ghost search UI and grows with the laptop until the
    // screen fills the viewport.
    const screenUI = document.createElement('div');
    screenUI.className = 'laptop-fly-screen-ui';
    screenUI.innerHTML = `
      <div class="laptop-fly-screen-ui__inner">
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
      </div>
    `;
    document.body.appendChild(screenUI);

    /* ── helpers ──────────────────────────────────────────────────────── */
    let screenMesh = null;  // the laptop display face we project from

    // Project the screen mesh's front face to CSS pixel rect.
    // Returns { x, y, w, h } in viewport pixels.
    function projectScreenRect() {
      if (!screenMesh) return null;
      const box = new THREE.Box3().setFromObject(screenMesh);
      // Use front face corners (max Z face) for the projection
      const pts = [
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      ].map((v) => {
        v.project(camera);
        return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
      });
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const rx = Math.min(...xs);
      const ry = Math.min(...ys);
      return { x: rx, y: ry, w: Math.max(...xs) - rx, h: Math.max(...ys) - ry };
    }

    // Snap the screen UI div to the projected rect every frame.
    function syncScreenUI(rect) {
      if (!rect) return;
      screenUI.style.left   = rect.x + 'px';
      screenUI.style.top    = rect.y + 'px';
      screenUI.style.width  = rect.w + 'px';
      screenUI.style.height = rect.h + 'px';
    }

    const easeOut    = (t) => 1 - Math.pow(1 - t, 3);
    const easeInOut  = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    let raf = null;
    const teardown = () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(hardTimeout);
      renderer.domElement?.remove();
      renderer.dispose();
      overlay.remove();
      screenUI.remove();
    };

    /* ── load MacBook GLB ─────────────────────────────────────────────── */
    const loader = new GLTFLoader();
    loader.load(
      MACBOOK_URL,
      (gltf) => {
        const model = gltf.scene;

        // Normalise to a consistent base size
        const box0   = new THREE.Box3().setFromObject(model);
        const span   = box0.getSize(new THREE.Vector3());
        const maxDim = Math.max(span.x, span.y, span.z) || 1;
        const base   = 1.5 / maxDim;
        const center = box0.getCenter(new THREE.Vector3()).multiplyScalar(base);
        model.scale.setScalar(base);
        model.position.sub(center);
        pivot.add(model);

        // Identify the screen mesh: prefer a child named screen/display/lcd,
        // fall back to any mesh whose bounding box is roughly flat on Z.
        model.traverse((child) => {
          if (!child.isMesh) return;
          const n = (child.name || '').toLowerCase();
          if (!screenMesh) { screenMesh = child; return; }
          if (n.includes('screen') || n.includes('display') || n.includes('lcd')) {
            screenMesh = child;
          }
        });

        // Initial pose: small, slightly below centre, lid angle natural
        pivot.scale.setScalar(0.6);
        pivot.position.set(0, -0.28, 0);
        pivot.rotation.set(0.22, 0.1, 0);

        // Render first frame THEN darken — room stays visible, no black flash
        renderer.render(scene, camera);
        requestAnimationFrame(() => overlay.classList.add('is-active'));

        const start = performance.now();
        let landedFired = false;
        let screenUIVisible = false;

        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);

          /* ── Phase A (0 – 55%): zoom MacBook in ── */
          if (t <= 0.55) {
            const e = easeOut(t / 0.55);
            // Scale from 0.6 up to 2.8 — enough for the screen to fill viewport
            pivot.scale.setScalar(0.6 + e * 2.2);
            pivot.position.set(0, -0.28 + e * 0.22, 0);
            // Flatten tilt as it approaches — lid faces camera head-on
            pivot.rotation.set(0.22 - e * 0.26, 0.1 - e * 0.1, 0);

            // Show screen UI once the laptop is big enough to house it legibly
            if (t > 0.18 && !screenUIVisible) {
              screenUIVisible = true;
              screenUI.classList.add('is-visible');
            }
          }

          /* ── Phase B (55% – 85%): bezel/body fade out ── */
          if (t > 0.55 && t <= 0.85) {
            const e = (t - 0.55) / 0.30;

            // Keep scale growing slowly so screen completely covers viewport
            pivot.scale.setScalar(2.8 + easeInOut(e) * 0.6);
            pivot.position.set(0, -0.06, 0);
            pivot.rotation.set(-0.04, 0, 0);

            // Fade laptop body meshes; leave screen mesh opaque until late
            model.traverse((child) => {
              if (!child.isMesh || child === screenMesh) return;
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach((m) => {
                m.transparent = true;
                m.opacity = Math.max(0, 1 - easeInOut(e) * 1.4);
              });
            });
            // Screen itself fades at the very end of Phase B
            if (screenMesh) {
              const mats = Array.isArray(screenMesh.material)
                ? screenMesh.material : [screenMesh.material];
              mats.forEach((m) => {
                m.transparent = true;
                m.opacity = Math.max(0, 1 - easeInOut(Math.max(0, e - 0.55) / 0.45));
              });
            }

            // Navigate at t=0.78 while overlay still covers page
            if (!landedFired && t >= 0.78) {
              landedFired = true;
              onLanded?.();
            }
          }

          /* ── Phase C (85% – 100%): fade overlay out ── */
          if (t > 0.85 && t <= 1) {
            if (!landedFired) { landedFired = true; onLanded?.(); }
            const e = (t - 0.85) / 0.15;
            overlay.style.opacity = String(1 - easeInOut(e));
            screenUI.style.opacity = String(1 - easeInOut(e));
          }

          // Project and reposition screen UI every frame during phases A + B
          if (t <= 0.85) {
            const rect = projectScreenRect();
            syncScreenUI(rect);
          }

          renderer.render(scene, camera);

          if (t < 1) {
            raf = requestAnimationFrame(tick);
          } else {
            if (!landedFired) { landedFired = true; onLanded?.(); }
            setTimeout(() => finish(teardown), 120);
          }
        };

        raf = requestAnimationFrame(tick);
      },
      undefined,
      () => { finish(teardown); },
    );
  });
}
