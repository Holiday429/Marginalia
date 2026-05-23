/* ==========================================================================
   Marginalia · Graph fly-in transition
   Plays a short 3D tack-board animation in a fullscreen overlay when entering
   the Graph view from the 3D room. The messy_tack_board.glb the user clicks
   fills the screen, dissolves into floating concept nodes, then hands off to
   the flat D3 graph. Bridges the 3D room and the 2D web so the two feel
   continuous.

   Lazy-loaded; degrades to an immediate resolve if WebGL/model fails so the
   navigation never blocks.
   ========================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BOARD_URL = '/3d/messy_tack_board.glb';

// D3 graph node palette colours
const NODE_COLORS = ['#c9a96e', '#8ab4a0', '#b8a0c8', '#a0b4c8', '#c8a0a0', '#b4c8a0'];

/**
 * Play the fly-in. Returns a Promise that resolves when the animation has
 * finished and the overlay has been cleaned up. Never rejects — on any failure
 * it resolves quickly so the caller can navigate regardless.
 *
 * @param {object} [opts]
 * @param {number} [opts.duration=1800] total animation time in ms
 * @param {() => void} [opts.onLanded] fired at t=0.82 while the overlay is
 *   still opaque — the caller should navigate here so the destination paints
 *   BEHIND the overlay before it fades out (no black gap).
 */
export function playGraphFlyIn(opts = {}) {
  const duration = opts.duration ?? 1800;
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
    overlay.className = 'graph-fly-overlay';
    // Start transparent: room stays visible while the model loads.
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

    // Build concept nodes (hidden initially, revealed in Phase B).
    const NODE_COUNT = 10;
    const nodes = [];
    const nodeTargets = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const geo = new THREE.SphereGeometry(0.04, 8, 8);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(NODE_COLORS[i % NODE_COLORS.length]),
        transparent: true,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0, 0);
      scene.add(mesh);
      nodes.push(mesh);

      // Random unit-sphere point × 1.8
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      nodeTargets.push(new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * 1.8,
        Math.sin(phi) * Math.sin(theta) * 1.8,
        Math.cos(phi) * 1.8,
      ));
    }

    // Build edges between adjacent nodes (revealed in Phase C).
    const edgePositions = [];
    for (let i = 0; i < NODE_COUNT - 1; i++) {
      edgePositions.push(nodeTargets[i], nodeTargets[i + 1]);
    }
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePositions);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xc9a96e, opacity: 0, transparent: true });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    scene.add(edges);

    const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const loader = new GLTFLoader();
    loader.load(
      BOARD_URL,
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const span = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(span.x, span.y, span.z) || 1;
        const baseScale = 2.0 / maxDim;
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(baseScale);
        model.scale.setScalar(baseScale);
        model.position.sub(center);
        pivot.add(model);

        // Render first frame, THEN darken — no black flash.
        renderer.render(scene, camera);
        requestAnimationFrame(() => overlay.classList.add('is-active'));

        const start = performance.now();
        let landedFired = false;

        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);

          if (t < 0.4) {
            // Phase A (0–40%): board fills centre, rotates slowly on Y axis.
            const e = easeInOut(t / 0.4);
            pivot.rotation.y = e * 0.8;
            pivot.scale.setScalar(1);
          } else if (t < 0.75) {
            // Phase B (40–75%): board mesh fades out, nodes fly outward.
            const e = (t - 0.4) / 0.35;
            pivot.rotation.y = 0.8 + e * 0.3;

            // Fade board out
            model.traverse((child) => {
              if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach((m) => {
                  m.transparent = true;
                  m.opacity = 1 - easeInOut(e);
                });
              }
            });

            // Nodes fly outward
            nodes.forEach((node, i) => {
              node.material.opacity = easeInOut(e);
              node.position.lerpVectors(new THREE.Vector3(0, 0, 0), nodeTargets[i], easeInOut(e));
            });
          } else {
            // Phase C (75–100%): nodes drift, edges appear.
            const e = (t - 0.75) / 0.25;

            nodes.forEach((node) => { node.material.opacity = 1; });
            edgeMat.opacity = easeInOut(e) * 0.4;

            // Fire onLanded at t≈0.82 while overlay is still opaque
            if (!landedFired && t >= 0.82) {
              landedFired = true;
              onLanded?.();
            }
          }

          renderer.render(scene, camera);

          if (t < 1) {
            raf = requestAnimationFrame(tick);
          } else {
            if (!landedFired) {
              landedFired = true;
              onLanded?.();
            }
            overlay.style.transition = 'opacity 0.5s ease';
            requestAnimationFrame(() => { overlay.style.opacity = '0'; });
            setTimeout(() => finish(teardown), 540);
          }
        };
        raf = requestAnimationFrame(tick);
      },
      undefined,
      () => { finish(teardown); }, // model failed — bail to navigation
    );
  });
}
