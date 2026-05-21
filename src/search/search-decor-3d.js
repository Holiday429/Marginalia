/* Search page — decorative 3D object (open book).
 *
 * A lightweight, self-contained Three.js render of an open book that anchors
 * the search page to the room's main visual. It is purely decorative
 * (aria-hidden) and degrades gracefully:
 *   - load is deferred until the container scrolls into view,
 *   - any load/WebGL failure silently hides the container,
 *   - prefers-reduced-motion disables the idle drift.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const MODEL_URL = '/3d/book_open.glb';

let started = false;
let teardown = null;

function loadModel() {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('/draco/');
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => {
    loader.load(MODEL_URL, (g) => { draco.dispose(); resolve(g); },
      undefined,
      (err) => { draco.dispose(); reject(err); });
  });
}

function mount(container) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const width = () => container.clientWidth || 1;
  const height = () => container.clientHeight || 1;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    container.style.display = 'none';
    return () => {};
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width(), height(), false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xfff2dc, 0.7));
  const key = new THREE.DirectionalLight(0xfff0d6, 1.2);
  key.position.set(2, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc9d8ff, 0.35);
  rim.position.set(-3, 2, -2);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(26, width() / height(), 0.1, 100);
  // Look at the book roughly head-on, slightly above, so the page spread reads.
  camera.position.set(0, 0.8, 5.6);
  camera.lookAt(0, 0, 0);

  // pivot (yaw sway) → tiltGroup (fixed orientation) → centered model.
  const pivot = new THREE.Group();
  const tiltGroup = new THREE.Group();
  pivot.add(tiltGroup);
  scene.add(pivot);

  // The open book lies pages-up (flat). Stand it up so the page spread faces
  // the viewer, then tip it back a touch so it doesn't look perfectly flat-on.
  const TILT_X = -Math.PI / 2 + 0.42; // ~-1.15: pages face the camera
  const BASE_YAW = 0;                 // square to the viewer
  const SWAY_AMPLITUDE = 0.10;        // radians (~5.7°) — gentle left/right turn
  const SWAY_PERIOD = 10000;          // ms per full sway cycle

  let mounted = true;
  let raf = 0;
  let modelReady = false;
  const startTime = performance.now();

  loadModel().then((gltf) => {
    if (!mounted) return;
    const model = gltf.scene;

    const bbox = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bbox.getSize(size);
    bbox.getCenter(center);

    const scale = 3.4 / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(scale);
    // Recenter the model on its own group origin so rotations stay centered.
    model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    tiltGroup.add(model);
    tiltGroup.rotation.x = TILT_X;
    pivot.rotation.y = BASE_YAW;

    modelReady = true;
    fit();
    renderer.render(scene, camera);
    container.classList.add('is-ready');
  }).catch(() => {
    if (!mounted) return;
    cleanup();
    container.style.display = 'none';
  });

  function fit() {
    const w = width();
    const h = height();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const ro = new ResizeObserver(() => { if (mounted) { fit(); renderer.render(scene, camera); } });
  ro.observe(container);

  function tick(now) {
    if (!mounted) return;
    if (modelReady) {
      // Gentle left/right turn around the vertical axis — slow and finite.
      const phase = ((now - startTime) % SWAY_PERIOD) / SWAY_PERIOD;
      pivot.rotation.y = BASE_YAW + Math.sin(phase * Math.PI * 2) * SWAY_AMPLITUDE;
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(tick);
  }
  if (!reduceMotion) raf = requestAnimationFrame(tick);

  function cleanup() {
    mounted = false;
    if (raf) cancelAnimationFrame(raf);
    ro.disconnect();
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.remove();
  }

  return cleanup;
}

export function initSearchDecor3d() {
  if (started) return;
  const container = document.getElementById('shelfDecor3d');
  if (!container) return;
  started = true;

  // Defer the heavy GLB until the decor scrolls into view.
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        io.disconnect();
        teardown = mount(container);
        break;
      }
    }
  }, { rootMargin: '200px' });
  io.observe(container);
}

export function disposeSearchDecor3d() {
  if (teardown) { teardown(); teardown = null; }
  started = false;
}
