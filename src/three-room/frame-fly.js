/* ==========================================================================
   Marginalia · Picture-frame fly-in transition
   Plays a short 3D animation in a fullscreen overlay when entering the Profile
   view from the 3D room. The same wooden_picture_frame.glb the user clicks in
   the room flies to centre, tilts to face the camera, then the framed photo
   zooms forward to fill the screen — as if stepping through the picture into
   your reading life. Hands off to the flat Profile page.

   Mirrors globe-fly.js: lazy-loaded, never rejects, degrades to an immediate
   resolve if WebGL/model fails so navigation never blocks.
   ========================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const FRAME_URL = '/3d/wooden_picture_frame.glb';
const PHOTO_URL = '/3d/me.jpg';

/**
 * Play the fly-in. Resolves when the animation has finished and the overlay is
 * cleaned up. Never rejects.
 *
 * @param {object} [opts]
 * @param {number} [opts.duration=2400] total animation time in ms
 */
export function playFrameFlyIn(opts = {}) {
  const duration = opts.duration ?? 2400;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (teardown) => {
      if (settled) return;
      settled = true;
      teardown?.();
      resolve();
    };

    const hardTimeout = setTimeout(() => finish(), duration + 1200);

    const overlay = document.createElement('div');
    overlay.className = 'frame-fly-overlay';
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
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const pivot = new THREE.Group();
    scene.add(pivot);

    // A standalone photo plane that overlays the frame's photo and zooms forward
    // at the end (the "step through the picture" beat). Sized to the frame's
    // inner aperture once the model loads.
    const photoTex = new THREE.TextureLoader().load(PHOTO_URL);
    photoTex.colorSpace = THREE.SRGBColorSpace;
    const photoMat = new THREE.MeshBasicMaterial({ map: photoTex, transparent: true, opacity: 0 });
    const photoPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), photoMat);
    photoPlane.visible = false;
    scene.add(photoPlane);

    let raf = null;
    const teardown = () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(hardTimeout);
      photoTex.dispose();
      photoMat.dispose();
      photoPlane.geometry.dispose();
      renderer.domElement?.remove();
      renderer.dispose();
      overlay.remove();
    };

    requestAnimationFrame(() => overlay.classList.add('is-active'));

    const loader = new GLTFLoader();
    loader.load(
      FRAME_URL,
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

        // Match the photo plane to the frame's visible footprint (slightly inset).
        const fw = span.x * baseScale * 0.78;
        const fh = span.y * baseScale * 0.78;
        photoPlane.scale.set(fw, fh, 1);

        const start = performance.now();
        const easeOut = (t) => 1 - Math.pow(1 - t, 3);
        const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

        // Three beats: settle to centre & face camera → photo fades in over the
        // frame → photo zooms toward the camera and the overlay fades out.
        const SETTLE = 0.34;
        const HOLD = 0.56;

        // The frame in the room is rotated; start tilted, settle to face-on.
        const startRotY = -0.6;
        const startRotX = 0.18;

        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);

          if (t < SETTLE) {
            // Beat 1 — grow from small, rotate to face the camera.
            const e = easeOut(t / SETTLE);
            pivot.scale.setScalar(0.45 + 0.55 * e);
            pivot.rotation.y = startRotY * (1 - e);
            pivot.rotation.x = startRotX * (1 - e);
            pivot.position.set(0, 0, -0.3 * (1 - e));
          } else if (t < HOLD) {
            // Beat 2 — hold face-on; fade the photo in over the frame aperture.
            const e = easeInOut((t - SETTLE) / (HOLD - SETTLE));
            pivot.scale.setScalar(1);
            pivot.rotation.set(0, 0, 0);
            pivot.position.set(0, 0, 0);
            photoPlane.visible = true;
            photoPlane.position.set(0, 0, 0.02);
            photoMat.opacity = e;
          } else {
            // Beat 3 — step through: photo zooms forward, frame recedes, fade out.
            const e = easeInOut((t - HOLD) / (1 - HOLD));
            photoPlane.visible = true;
            photoMat.opacity = 1;
            const z = 0.02 + e * 3.6;            // toward the camera (z=4.2)
            photoPlane.position.set(0, 0, z);
            const grow = 1 + e * 2.4;
            photoPlane.scale.set(fw * grow, fh * grow, 1);
            pivot.scale.setScalar(1 + e * 0.3);
            pivot.position.set(0, 0, -e * 0.8);
            overlay.style.opacity = String(1 - easeOut(e));
          }

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
