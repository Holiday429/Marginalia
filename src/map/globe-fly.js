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
 */
export function playGlobeFlyIn(opts = {}) {
  const duration = opts.duration ?? 1400;

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

    requestAnimationFrame(() => overlay.classList.add('is-active'));

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

        const start = performance.now();
        const easeOut = (t) => 1 - Math.pow(1 - t, 3);
        const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const smooth = (t) => t * t * (3 - 2 * t);   // smoothstep

        // World-space target for the bottom-LEFT corner, so the globe flies to
        // roughly where the decorative globe sits and hands off seamlessly.
        const halfH = Math.tan((camera.fov * Math.PI / 180) / 2) * camera.position.z;
        const halfW = halfH * camera.aspect;
        const cornerX = -halfW * 0.82;   // bottom-LEFT
        const cornerY = -halfH * 0.74;

        // End rotation a bit short of whole turns so the front face — not the
        // stand/support — is toward the viewer when it comes to rest.
        const SPIN_TURNS = 1.6;
        const TRAVEL_START = 0.42;   // begin drifting to the corner before fully grown

        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);

          // Slow, calm spin that eases to a stop short of a whole turn.
          pivot.rotation.y = easeOut(t) * Math.PI * 2 * SPIN_TURNS;

          // Scale: a gentle grow at the start, then a continuous shrink toward
          // the corner size — one smooth curve, no hard phase switch.
          const grow = easeOut(Math.min(1, t / 0.32));        // 0→1 over first third
          const shrink = smooth(Math.max(0, (t - TRAVEL_START) / (1 - TRAVEL_START)));
          const scale = (0.42 + 0.58 * grow) * (1 - 0.66 * shrink);
          pivot.scale.setScalar(scale);

          // Travel: ease along a path from centre to the bottom-left corner,
          // starting partway through so growth and travel overlap smoothly.
          const travel = easeInOut(Math.max(0, (t - TRAVEL_START) / (1 - TRAVEL_START)));
          pivot.position.set(cornerX * travel, cornerY * travel, -0.4 * (1 - travel));

          // Scrim fades out across the travel so the map appears behind it.
          overlay.style.opacity = String(1 - smooth(Math.max(0, (t - 0.55) / 0.45)));

          renderer.render(scene, camera);

          if (t < 1) {
            raf = requestAnimationFrame(tick);
          } else {
            finish(teardown);
          }
        };
        raf = requestAnimationFrame(tick);
      },
      undefined,
      () => { finish(teardown); } // model failed — bail to navigation
    );
  });
}
