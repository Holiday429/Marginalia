/* ==========================================================================
   Marginalia · Map decorative globe
   A small, slowly-rotating 3D globe (the same antique_globe.glb used as the
   Map entry object in the 3D room) rendered into a corner of the 2D map page.
   Purpose: visual continuity between the 3D room and the flat map — the object
   you click in the room reappears here. Decorative only; no interaction logic.

   Lazy-loaded via dynamic import so Three.js never blocks initial map paint.
   ========================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { logError } from '../services/analytics.ts';

const GLOBE_URL = '/3d/antique_globe.glb';

let _renderer = null;
let _scene = null;
let _camera = null;
let _globe = null;
let _raf = null;
let _mounted = false;
let _resizeObs = null;

// Honour reduced-motion: render a single static frame, no spin loop.
const _prefersReducedMotion = typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mountMapGlobe(container) {
  if (_mounted || !container) return;
  _mounted = true;

  const size = () => ({
    w: container.clientWidth || 160,
    h: container.clientHeight || 160,
  });

  const { w, h } = size();

  _renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  _renderer.setSize(w, h);
  _renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(_renderer.domElement);

  _scene = new THREE.Scene();
  _camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 100);
  _camera.position.set(0, 0.1, 3.4);

  // Warm key + soft fill so the brass/paper globe reads against the dark page.
  const key = new THREE.DirectionalLight(0xffe6b8, 2.1);
  key.position.set(2, 3, 4);
  _scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fb0c4, 0.7);
  fill.position.set(-3, -1, -2);
  _scene.add(fill);
  _scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  const loader = new GLTFLoader();
  loader.load(
    GLOBE_URL,
    (gltf) => {
      const model = gltf.scene;
      // Normalise to a consistent on-screen size regardless of source scale.
      const box = new THREE.Box3().setFromObject(model);
      const span = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(span.x, span.y, span.z) || 1;
      const scale = 2.0 / maxDim;
      model.scale.setScalar(scale);

      const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
      model.position.sub(center);

      _globe = model;
      _scene.add(model);
      renderOnce();
      if (!_prefersReducedMotion) startSpin();
    },
    undefined,
    (err) => {
      // Globe is purely decorative — log and degrade to nothing on failure.
      logError(err instanceof Error ? err : new Error(String(err)), { context: 'map globe load' });
      unmountMapGlobe();
    }
  );

  // Keep the canvas crisp if the container resizes (panel open/close, viewport).
  _resizeObs = new ResizeObserver(() => {
    if (!_renderer || !_camera) return;
    const { w, h } = size();
    if (w === 0 || h === 0) return;
    _renderer.setSize(w, h);
    _camera.aspect = w / h;
    _camera.updateProjectionMatrix();
    renderOnce();
  });
  _resizeObs.observe(container);
}

function renderOnce() {
  if (_renderer && _scene && _camera) _renderer.render(_scene, _camera);
}

function startSpin() {
  const tick = () => {
    if (_globe) _globe.rotation.y += 0.0024;
    renderOnce();
    _raf = requestAnimationFrame(tick);
  };
  _raf = requestAnimationFrame(tick);
}

export function unmountMapGlobe() {
  if (_raf) cancelAnimationFrame(_raf);
  _raf = null;
  if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }
  if (_globe && _scene) _scene.remove(_globe);
  if (_renderer) {
    _renderer.domElement?.remove();
    _renderer.dispose();
  }
  _renderer = _scene = _camera = _globe = null;
  _mounted = false;
}
