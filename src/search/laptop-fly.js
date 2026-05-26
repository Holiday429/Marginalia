/* ==========================================================================
   Marginalia · Laptop fly-in transition
   The MacBook on the desk zooms toward the camera; as it fills the screen its
   display lights up showing a ghost of the Search UI (search bar + filter chip
   + tags). The 3D laptop dissolves, the ghost elements fly to their real DOM
   positions, and the rest of the Search page fades in around them.

   Sequence
   ─────────────────────────────────────────────────────────────────────────
   Phase A (0–45%)  WebGL: MacBook zooms forward + rotates to face camera.
                    Screen glows on at t=0.25.
   Phase B (45–75%) WebGL: laptop body fades out. CSS ghost search bar +
                    filter chips appear inside the projected screen rect.
   Phase C (75–100%) Ghost elements animate from screen rect to their real
                    DOM positions (FLIP). onLanded fires at t=0.82.
                    Overlay fades out, revealing the real page. Ghost removed.
   ========================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MACBOOK_URL = '/3d/macbook.glb';

/**
 * @param {object} [opts]
 * @param {number} [opts.duration=1600]
 * @param {() => void} [opts.onLanded]  fired at t=0.82 — navigate here
 */
export function playLaptopFlyIn(opts = {}) {
  const duration = opts.duration ?? 1600;
  const onLanded = typeof opts.onLanded === 'function' ? opts.onLanded : null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (teardown) => {
      if (settled) return;
      settled = true;
      teardown?.();
      resolve();
    };

    const hardTimeout = setTimeout(() => finish(), duration + 1400);

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
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 100);
    camera.position.set(0, 0, 4.8);

    const key = new THREE.DirectionalLight(0xffe6c8, 2.0);
    key.position.set(2, 3, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb0c4, 0.5);
    fill.position.set(-3, -1, -2);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const pivot = new THREE.Group();
    scene.add(pivot);

    let screenMesh = null; // the laptop display plane we'll light up

    let raf = null;
    const teardown = () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(hardTimeout);
      renderer.domElement?.remove();
      renderer.dispose();
      overlay.remove();
      ghostEl?.remove();
    };

    /* ── ghost UI (appears inside the 3D screen, flies to real positions) ── */
    let ghostEl = null;

    function buildGhost() {
      ghostEl = document.createElement('div');
      ghostEl.className = 'laptop-fly-ghost';
      ghostEl.innerHTML = `
        <div class="laptop-fly-ghost__screen">
          <div class="laptop-fly-ghost__searchbar">
            <svg class="laptop-fly-ghost__search-icon" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3"/>
              <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <span class="laptop-fly-ghost__placeholder">Search your shelf by title, author, or tag</span>
          </div>
          <div class="laptop-fly-ghost__chips">
            <span class="laptop-fly-ghost__chip is-active">All</span>
            <span class="laptop-fly-ghost__chip">Finished</span>
            <span class="laptop-fly-ghost__chip">Reading</span>
            <span class="laptop-fly-ghost__chip">To Read</span>
          </div>
        </div>
      `;
      document.body.appendChild(ghostEl);
      return ghostEl;
    }

    /* ── FLIP helper: move ghostEl from current rect to real DOM target ── */
    function flyGhostToTarget(ghostScreenRect) {
      if (!ghostEl) return;

      // Find real search bar position
      const realSearchbar = document.getElementById('shelfSearchInput');
      const realFilters   = document.getElementById('shelfStatusChips');

      const screen = ghostEl.querySelector('.laptop-fly-ghost__screen');
      const bar    = ghostEl.querySelector('.laptop-fly-ghost__searchbar');
      const chips  = ghostEl.querySelector('.laptop-fly-ghost__chips');
      if (!screen || !bar || !chips) return;

      // Position ghost at the projected screen rect
      screen.style.left   = ghostScreenRect.x + 'px';
      screen.style.top    = ghostScreenRect.y + 'px';
      screen.style.width  = ghostScreenRect.w + 'px';
      screen.style.height = ghostScreenRect.h + 'px';

      // Force layout read before animating
      screen.getBoundingClientRect();

      // Determine landing targets
      const barTarget    = realSearchbar?.closest('.shelf-searchbar')?.getBoundingClientRect();
      const chipsTarget  = realFilters?.getBoundingClientRect();

      screen.style.transition = 'left 0.45s cubic-bezier(0.4,0,0.2,1), top 0.45s cubic-bezier(0.4,0,0.2,1), width 0.45s cubic-bezier(0.4,0,0.2,1), height 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease';
      bar.style.transition    = 'all 0.4s cubic-bezier(0.4,0,0.2,1)';
      chips.style.transition  = 'all 0.4s cubic-bezier(0.4,0,0.2,1) 0.05s';

      if (barTarget) {
        screen.style.left   = barTarget.left + 'px';
        screen.style.top    = barTarget.top + 'px';
        screen.style.width  = barTarget.width + 'px';
        screen.style.height = (chipsTarget ? (chipsTarget.bottom - barTarget.top) : barTarget.height) + 'px';
      }

      // Fade ghost out as real page appears
      setTimeout(() => {
        if (ghostEl) ghostEl.style.opacity = '0';
      }, 280);
    }

    /* ── project 3D screen rect to CSS pixels ── */
    function getScreenRect() {
      if (!screenMesh) {
        // Fallback: centre of viewport, 45% wide, 28% tall
        return { x: w * 0.275, y: h * 0.28, w: w * 0.45, h: h * 0.28 };
      }
      const box = new THREE.Box3().setFromObject(screenMesh);
      const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      ];
      const projected = corners.map((v) => {
        v.project(camera);
        return {
          x: (v.x * 0.5 + 0.5) * w,
          y: (-v.y * 0.5 + 0.5) * h,
        };
      });
      const xs = projected.map((p) => p.x);
      const ys = projected.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }

    const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const easeOut   = (t) => 1 - Math.pow(1 - t, 3);

    /* ── load model ── */
    const loader = new GLTFLoader();
    loader.load(
      MACBOOK_URL,
      (gltf) => {
        const model = gltf.scene;

        // Normalise scale
        const box = new THREE.Box3().setFromObject(model);
        const span = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(span.x, span.y, span.z) || 1;
        const baseScale = 1.6 / maxDim;
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(baseScale);
        model.scale.setScalar(baseScale);
        model.position.sub(center);
        pivot.add(model);

        // Find the screen mesh (brightest / flattest face, or just the first mesh
        // that has "screen" / "display" in its name, fallback to first Mesh).
        model.traverse((child) => {
          if (!child.isMesh) return;
          const name = (child.name || '').toLowerCase();
          if (!screenMesh || name.includes('screen') || name.includes('display') || name.includes('lcd')) {
            screenMesh = child;
          }
        });

        // Starting pose: laptop a bit below and tilted away
        pivot.position.set(0, -0.3, 0);
        pivot.rotation.set(0.3, 0.12, 0);
        pivot.scale.setScalar(0.72);

        // Render first frame, then darken the overlay (room stays visible until now)
        renderer.render(scene, camera);
        requestAnimationFrame(() => overlay.classList.add('is-active'));

        const start = performance.now();
        let ghostAdded = false;
        let landedFired = false;
        let ghostScreenRect = null;

        /* ── screen emissive material ── */
        let screenMat = null;
        if (screenMesh?.material) {
          const mats = Array.isArray(screenMesh.material)
            ? screenMesh.material
            : [screenMesh.material];
          screenMat = mats[0];
          if (screenMat) {
            screenMat = screenMat.clone();
            screenMat.emissive = new THREE.Color(0x4a90c8);
            screenMat.emissiveIntensity = 0;
            if (Array.isArray(screenMesh.material)) {
              screenMesh.material[0] = screenMat;
            } else {
              screenMesh.material = screenMat;
            }
          }
        }

        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);

          if (t < 0.45) {
            /* ── Phase A: zoom laptop in, rotate to face camera ── */
            const e = easeOut(t / 0.45);
            pivot.scale.setScalar(0.72 + e * 0.88);         // 0.72 → 1.6
            pivot.position.set(0, -0.3 + e * 0.24, 0);       // rise up
            pivot.rotation.set(0.3 - e * 0.38, 0.12 - e * 0.12, 0); // tilt to face

            // Screen glows on between t=0.25 and t=0.45
            if (t > 0.25 && screenMat) {
              const glow = Math.min(1, (t - 0.25) / 0.2);
              screenMat.emissiveIntensity = easeInOut(glow) * 0.55;
            }
          } else if (t < 0.75) {
            /* ── Phase B: laptop body fades out, ghost appears ── */
            const e = (t - 0.45) / 0.30;

            // Freeze laptop pose at end of Phase A
            pivot.scale.setScalar(1.6);
            pivot.position.set(0, -0.06, 0);
            pivot.rotation.set(-0.08, 0, 0);

            // Fade out laptop body meshes (keep screen mesh glowing briefly)
            model.traverse((child) => {
              if (!child.isMesh) return;
              if (child === screenMesh) return;
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach((m) => { m.transparent = true; m.opacity = 1 - easeInOut(e); });
            });

            // Screen fades too, slightly delayed
            if (screenMat) {
              screenMat.transparent = true;
              screenMat.opacity = 1 - easeInOut(Math.max(0, e - 0.3) / 0.7);
              screenMat.emissiveIntensity = 0.55 * (1 - easeInOut(e));
            }

            // Inject ghost at start of Phase B
            if (!ghostAdded) {
              ghostAdded = true;
              ghostScreenRect = getScreenRect();
              buildGhost();
              // Position ghost screen
              const screen = ghostEl.querySelector('.laptop-fly-ghost__screen');
              if (screen && ghostScreenRect) {
                screen.style.left   = ghostScreenRect.x + 'px';
                screen.style.top    = ghostScreenRect.y + 'px';
                screen.style.width  = ghostScreenRect.w + 'px';
                screen.style.height = ghostScreenRect.h + 'px';
              }
              // Fade ghost in
              requestAnimationFrame(() => {
                ghostEl.style.opacity = '1';
              });
            }
          } else {
            /* ── Phase C: ghost flies to real positions, page fades in ── */
            if (!landedFired && t >= 0.82) {
              landedFired = true;
              onLanded?.();               // navigate — real page renders behind overlay
            }

            if (ghostAdded && ghostScreenRect && !ghostEl._flying) {
              ghostEl._flying = true;
              // Fade the WebGL canvas out while ghost flies
              renderer.domElement.style.transition = 'opacity 0.3s ease';
              renderer.domElement.style.opacity = '0';
              // Fly ghost elements to real DOM positions
              flyGhostToTarget(ghostScreenRect);
            }
          }

          if (t < 0.75) renderer.render(scene, camera);

          if (t < 1) {
            raf = requestAnimationFrame(tick);
          } else {
            if (!landedFired) { landedFired = true; onLanded?.(); }
            // Fade overlay out to reveal real page
            overlay.style.transition = 'opacity 0.45s ease';
            requestAnimationFrame(() => { overlay.style.opacity = '0'; });
            setTimeout(() => finish(teardown), 480);
          }
        };
        raf = requestAnimationFrame(tick);
      },
      undefined,
      () => { finish(teardown); },
    );
  });
}
