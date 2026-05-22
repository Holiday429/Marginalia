/* ==========================================================================
   Marginalia · Globe fly-in transition
   Plays a short 3D-globe animation in a fullscreen overlay when entering the
   Map view from the 3D room. The same antique_globe.glb the user clicks in the
   room flies to centre, spins, and scales up — then the overlay fades to reveal
   the flat map. Bridges the 3D room and the 2D map so the two feel continuous.

   Lazy-loaded; degrades to an immediate resolve if WebGL/model fails so the
   navigation never blocks.
   ========================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const GLOBE_URL = '/3d/antique_globe.glb';

/**
 * Play the fly-in. Returns a Promise that resolves when the animation has
 * finished and the overlay has been cleaned up. Never rejects — on any failure
 * it resolves quickly so the caller can navigate regardless.
 *
 * @param {object} [opts]
 * @param {number} [opts.duration=1400] total animation time in ms
 * @param {() => void} [opts.onLanded] fired once the globe reaches the corner,
 *   while the scrim still covers the screen — the caller should navigate here so
 *   the destination paints BEHIND the overlay before it fades out (no black gap).
 */
export function playGlobeFlyIn(opts = {}) {
  const duration = opts.duration ?? 1400;
  const onLanded = typeof opts.onLanded === 'function' ? opts.onLanded : null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (teardown) => {
      if (settled) return;
      settled = true;
      teardown?.();
      resolve();
    };

    // Safety net: never hang the navigation.
    const hardTimeout = setTimeout(() => finish(), duration + 1200);

    const overlay = document.createElement('div');
    overlay.className = 'globe-fly-overlay';
    // Start transparent: the room stays visible behind it while the globe model
    // loads — never a black flash. The scrim darkens only once the globe's first
    // frame is on screen (below), so the globe appears and immediately spins.
    document.body.appendChild(overlay);

    const w = window.innerWidth;
    const h = window.innerHeight;

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

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 100);
    camera.position.set(0, 0, 4.2);

    const key = new THREE.DirectionalLight(0xffe6b8, 2.2);
    key.position.set(2, 3, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb0c4, 0.7);
    fill.position.set(-3, -1, -2);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const pivot = new THREE.Group();
    scene.add(pivot);

    let raf = null;
    const teardown = () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(hardTimeout);
      renderer.domElement?.remove();
      renderer.dispose();
      overlay.remove();
    };

    // NOTE: the scrim is intentionally NOT darkened here. The globe model is a
    // large asset and can take a moment to arrive; darkening up-front would show
    // a solid black screen while it loads. Instead we keep the overlay clear so
    // the room stays visible behind it, render the globe's first frame the
    // instant the model is ready, and only THEN fade the scrim in (below). The
    // user clicks the globe and immediately sees a spinning globe — no black gap.

    const loader = new GLTFLoader();
    loader.load(
      GLOBE_URL,
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const span = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(span.x, span.y, span.z) || 1;
        const baseScale = 2.2 / maxDim;
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(baseScale);
        model.scale.setScalar(baseScale);
        model.position.sub(center);
        pivot.add(model);

        // Globe appears at full size, centred; render its first frame, THEN
        // darken the scrim — so the globe is already on screen, never a black gap.
        pivot.scale.setScalar(1);
        renderer.render(scene, camera);
        requestAnimationFrame(() => overlay.classList.add('is-active'));

        const start = performance.now();
        const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        // World-space target for the bottom-LEFT corner, so the globe flies to
        // roughly where the decorative globe sits and hands off seamlessly.
        const halfH = Math.tan((camera.fov * Math.PI / 180) / 2) * camera.position.z;
        const halfW = halfH * camera.aspect;
        const cornerX = -halfW * 0.82;   // bottom-LEFT
        const cornerY = -halfH * 0.74;

        // First ~full turn: spin in place at the centre. After that: keep
        // spinning while shrinking and travelling to the corner.
        const SPIN_HOLD = 0.42;       // fraction spent spinning before shrinking
        const TURNS = 2.4;            // total turns; eased so it slows to a stop

        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);

          // Constant spin speed throughout — same rate from start to finish.
          pivot.rotation.y = t * Math.PI * 2 * TURNS;

          if (t < SPIN_HOLD) {
            // Phase 1 — full size, centred, just turning (≈ first full turn).
            pivot.scale.setScalar(1);
            pivot.position.set(0, 0, 0);
          } else {
            // Phase 2 — shrink + travel to the bottom-left corner together.
            const e = easeInOut((t - SPIN_HOLD) / (1 - SPIN_HOLD));
            pivot.scale.setScalar(1 - 0.66 * e);
            pivot.position.set(cornerX * e, cornerY * e, -0.4 * e);
          }

          renderer.render(scene, camera);

          if (t < 1) {
            raf = requestAnimationFrame(tick);
          } else {
            // Globe has landed in the corner. Let the caller navigate (the map
            // paints behind this still-opaque overlay), then fade the scrim out
            // to reveal it — never a black gap — and finally tear down.
            onLanded?.();
            overlay.style.transition = 'opacity 0.5s ease';
            requestAnimationFrame(() => { overlay.style.opacity = '0'; });
            setTimeout(() => finish(teardown), 540);
          }
        };
        raf = requestAnimationFrame(tick);
      },
      undefined,
      () => { finish(teardown); } // model failed — bail to navigation
    );
  });
}
