/* Hero book — Three.js GLB render (ES module) */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/loaders/GLTFLoader.js';

const MODEL_URL = 'book.glb';

let cachedGltf    = null;
let cachedPromise = null;
function loadModel() {
  if (cachedGltf)    return Promise.resolve(cachedGltf);
  if (cachedPromise) return cachedPromise;
  const loader = new GLTFLoader();
  cachedPromise = new Promise((resolve, reject) => {
    loader.load(MODEL_URL, (g) => { cachedGltf = g; resolve(g); }, undefined, reject);
  });
  return cachedPromise;
}

function projectBoxToPixels(box, camera, width, height) {
  const xs = [box.min.x, box.max.x];
  const ys = [box.min.y, box.max.y];
  const zs = [box.min.z, box.max.z];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        const p = new THREE.Vector3(x, y, z).project(camera);
        minX = Math.min(minX, (p.x * 0.5 + 0.5) * width);
        maxX = Math.max(maxX, (p.x * 0.5 + 0.5) * width);
        minY = Math.min(minY, (-p.y * 0.5 + 0.5) * height);
        maxY = Math.max(maxY, (-p.y * 0.5 + 0.5) * height);
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

export function mountHeroGLB(bookEl) {
  const bookInner = bookEl.querySelector('.book-inner');
  if (!bookInner) return;

  bookEl.classList.add('hero-glb');

  const stage = document.createElement('div');
  stage.className = 'glb-stage';
  bookInner.appendChild(stage);
  bookEl.style.setProperty('--hero-dynamic-left',  '0px');
  bookEl.style.setProperty('--hero-dynamic-right', '0px');

  const cs       = getComputedStyle(bookEl);
  const spineW   = parseFloat(cs.getPropertyValue('--spine-w'))  || bookEl.offsetWidth;
  const expand   = parseFloat(cs.getPropertyValue('--expand'))   || 0;
  const clearance = parseFloat(cs.getPropertyValue('--hero-stage-clearance')) || 0;
  const bookH    = parseFloat(cs.getPropertyValue('--book-h'))   || bookEl.offsetHeight;

  let stageLeft  = 0;
  let stageRight = expand + clearance;
  let stageW     = spineW + stageRight;
  const stageH   = bookH;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(stageW, stageH, false);
  renderer.outputColorSpace   = THREE.SRGBColorSpace;
  renderer.toneMapping        = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xfff2dc, 0.65));
  const key = new THREE.DirectionalLight(0xfff0d6, 1.15);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc9d8ff, 0.35);
  rim.position.set(-3, 2, -2);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(22, stageW / stageH, 0.1, 100);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);

  const rig   = new THREE.Group();
  const pivot = new THREE.Group();
  scene.add(rig);
  rig.add(pivot);

  let mounted = true;
  const REST_ANGLE = 0;
  const OPEN_ANGLE = REST_ANGLE - Math.PI / 2;
  const FLIP_TAU   = 170;
  let targetAngle  = REST_ANGLE;
  let currentAngle = REST_ANGLE;
  let spacingProfile = null;

  function sampleProfile(angleCount) {
    const samples   = [];
    const GAP_BUFFER = 8;
    pivot.rotation.y = REST_ANGLE;
    const restPixels = projectBoxToPixels(new THREE.Box3().setFromObject(rig), camera, stageW, stageH);
    for (let i = 0; i <= angleCount; i++) {
      const t     = i / angleCount;
      const angle = REST_ANGLE + (OPEN_ANGLE - REST_ANGLE) * t;
      pivot.rotation.y = angle;
      const px    = projectBoxToPixels(new THREE.Box3().setFromObject(rig), camera, stageW, stageH);
      samples.push({
        t,
        left:  Math.max(0, restPixels.minX - px.minX) > 0 ? Math.max(0, restPixels.minX - px.minX) + GAP_BUFFER : 0,
        right: Math.max(0, px.maxX - restPixels.maxX) > 0 ? Math.max(0, px.maxX - restPixels.maxX) + GAP_BUFFER : 0
      });
    }
    pivot.rotation.y = currentAngle;
    return samples;
  }

  function interpolateSpacing(angle) {
    if (!spacingProfile?.length) return { left: 0, right: 0 };
    const t = Math.max(0, Math.min(1, (angle - REST_ANGLE) / (OPEN_ANGLE - REST_ANGLE)));
    for (let i = 1; i < spacingProfile.length; i++) {
      const prev = spacingProfile[i - 1];
      const next = spacingProfile[i];
      if (t <= next.t) {
        const span   = next.t - prev.t || 1;
        const localT = (t - prev.t) / span;
        return { left: prev.left + (next.left - prev.left) * localT, right: prev.right + (next.right - prev.right) * localT };
      }
    }
    return spacingProfile[spacingProfile.length - 1];
  }

  function applySpacing(angle) {
    const s = interpolateSpacing(angle);
    bookEl.style.setProperty('--hero-dynamic-left',  `${s.left.toFixed(2)}px`);
    bookEl.style.setProperty('--hero-dynamic-right', `${s.right.toFixed(2)}px`);
  }

  loadModel().then((gltf) => {
    if (!mounted) return;
    const model = gltf.scene.clone(true);

    const bbox   = new THREE.Box3().setFromObject(model);
    const size   = new THREE.Vector3();
    const center = new THREE.Vector3();
    bbox.getSize(size);
    bbox.getCenter(center);

    const scale = 2.0 / size.y;
    model.scale.setScalar(scale);
    const scaledSize   = size.clone().multiplyScalar(scale);
    const scaledCenter = center.clone().multiplyScalar(scale);

    const sx = scaledSize.x, sz = scaledSize.z;
    if (sx < sz) {
      model.position.set(-scaledCenter.x + sx / 2, -scaledCenter.y, -scaledCenter.z);
      pivot.add(model);
    } else {
      const inner = new THREE.Group();
      model.position.set(-scaledCenter.x, -scaledCenter.y, -scaledCenter.z);
      inner.add(model);
      inner.rotation.y  = Math.PI / 2;
      inner.position.x  = sz / 2;
      pivot.add(inner);
    }

    pivot.rotation.y = REST_ANGLE;
    const restBox    = new THREE.Box3().setFromObject(pivot);
    const restSize   = new THREE.Vector3();
    const restCenter = new THREE.Vector3();
    restBox.getSize(restSize);
    restBox.getCenter(restCenter);

    pivot.rotation.y = OPEN_ANGLE;
    const openBox  = new THREE.Box3().setFromObject(pivot);
    const openSize = new THREE.Vector3();
    openBox.getSize(openSize);
    pivot.rotation.y = REST_ANGLE;

    const worldW = Math.max(restSize.x, openSize.x) * 1.15;
    const worldH = Math.max(restSize.y, openSize.y);
    const fov    = camera.fov * Math.PI / 180;

    function layoutStage(leftPad, rightPad) {
      stageLeft  = leftPad;
      stageRight = rightPad;
      stageW     = spineW + stageLeft + stageRight;

      stage.style.left  = `${-stageLeft}px`;
      stage.style.width = `${stageW}px`;
      renderer.setSize(stageW, stageH, false);
      camera.aspect = stageW / stageH;
      camera.updateProjectionMatrix();

      const distForHeight = (worldH / 2) / Math.tan(fov / 2);
      const distForWidth  = (worldW / 2) / (Math.tan(fov / 2) * camera.aspect);
      const dist = Math.max(distForHeight, distForWidth) + 1.0;
      camera.position.set(0, 0, dist);
      camera.lookAt(0, 0, 0);

      const frustumW = 2 * dist * Math.tan(fov / 2) * camera.aspect;
      const frustumH = 2 * dist * Math.tan(fov / 2);
      const slotCenterWorldX = ((stageLeft + spineW / 2) / stageW - 0.5) * frustumW;
      rig.position.x = slotCenterWorldX - restCenter.x;

      const targetBottomWorld = -frustumH / 2;
      rig.position.y = targetBottomWorld - restBox.min.y;

      const fitted = projectBoxToPixels(new THREE.Box3().setFromObject(rig), camera, stageW, stageH);
      const pxToWorldY = frustumH / stageH;
      if (fitted.minY < 2)       rig.position.y -= (2 - fitted.minY) * pxToWorldY;
      if (fitted.maxY > stageH)  rig.position.y += (fitted.maxY - stageH) * pxToWorldY;

      const profile  = sampleProfile(18);
      const maxLeft  = profile.reduce((m, s) => Math.max(m, s.left),  0);
      const maxRight = profile.reduce((m, s) => Math.max(m, s.right), 0);
      return { leftSpace: maxLeft, rightSpace: maxRight, profile };
    }

    const measured = layoutStage(0, expand + clearance);
    const settled  = layoutStage(Math.round(measured.leftSpace), Math.round(measured.rightSpace));
    spacingProfile = settled.profile;

    const openNow = bookEl.classList.contains('opened');
    targetAngle  = openNow ? OPEN_ANGLE : REST_ANGLE;
    currentAngle = targetAngle;
    pivot.rotation.y = currentAngle;
    applySpacing(currentAngle);
    renderer.render(scene, camera);
  }).catch((err) => {
    console.error('[hero-glb] load failed, falling back to CSS:', err);
    if (!mounted) return;
    mounted = false;
    obs.disconnect();
    renderer.dispose();
    stage.remove();
    bookEl.classList.remove('hero-glb');
    bookEl.style.setProperty('--hero-dynamic-left',  '0px');
    bookEl.style.setProperty('--hero-dynamic-right', '0px');
  });

  let last = performance.now();
  function tick(now) {
    if (!mounted) return;
    const dt = now - last;
    last = now;
    if (currentAngle !== targetAngle) {
      currentAngle += (targetAngle - currentAngle) * (1 - Math.exp(-dt / FLIP_TAU));
      if (Math.abs(targetAngle - currentAngle) < 0.001) currentAngle = targetAngle;
      pivot.rotation.y = currentAngle;
      applySpacing(currentAngle);
      renderer.render(scene, camera);
    } else if (spacingProfile) {
      applySpacing(currentAngle);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  const obs = new MutationObserver(() => {
    targetAngle = bookEl.classList.contains('opened') ? OPEN_ANGLE : REST_ANGLE;
  });
  obs.observe(bookEl, { attributes: true, attributeFilter: ['class'] });

  return () => {
    mounted = false;
    obs.disconnect();
    renderer.dispose();
    stage.remove();
    bookEl.classList.remove('hero-glb');
  };
}

// Wire into the preloader shelf
let currentTeardown = null;
let mountedHeroEl   = null;

function attachHeroGLB() {
  const heroEl = document.querySelector('.book.hero-3d');
  if (!heroEl || heroEl === mountedHeroEl) return;
  if (currentTeardown) { currentTeardown(); currentTeardown = null; }
  mountedHeroEl    = heroEl;
  currentTeardown  = mountHeroGLB(heroEl);
}

const track = document.getElementById('track');
if (track) {
  attachHeroGLB();
  new MutationObserver(() => attachHeroGLB()).observe(track, { childList: true });
}
