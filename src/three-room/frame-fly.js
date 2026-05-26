/* ==========================================================================
   Marginalia · Picture-frame fly-in transition (simplified single-photo flow)
   --------------------------------------------------------------------------
   The frame is the 3D room's entry point into the Profile view. Clicking it
   lifts the real wooden frame out of the scene onto a solid colour ground:

   Act 1  The frame settles in centre, tilted a touch so its wooden thickness
          reads as a real object (not a flat UI card), then rotates upright.
   Act 2  The single photo (same image as the profile avatar) is pulled forward
          out of the frame while the wood fades away — leaving just the photo.
   Act 3  The freed photo morphs square → round, shrinks to an avatar-sized
          ball, and hops left → right across one row of book spines (no extra
          motion, no flight across the screen). At the right end it spins once
          in place, then glides in one low arc into the profile banner avatar
          slot. Only AFTER it lands does the rest of the profile page fade in.

   The photo is textured onto the glb's built-in "Image" mesh so it fills the
   real opening in correct perspective — never the placeholder graphic.
   ========================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SHELF_BOOKS } from '../data/mock/seed-spines.js';

const FRAME_URL = '/3d/wooden_picture_frame.glb';
const PHOTO_URL = '/3d/profile-frame-photo.jpg';
const OVERLAY_ID = 'profileFrameTransitionOverlay';
const CIRCLE_ID = 'profileFrameTransitionCircle';
const SPINES_ID = 'profileFrameTransitionSpines';
const TARGET_SELECTOR = '[data-profile-avatar-target]';

let activeTransition = null;

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function cleanupRendererOnly() {
  if (!activeTransition?.rendererState) return;
  const { rendererState } = activeTransition;
  if (rendererState.raf) cancelAnimationFrame(rendererState.raf);
  if (rendererState.hardTimeout) clearTimeout(rendererState.hardTimeout);
  rendererState.textures?.forEach((texture) => texture?.dispose?.());
  rendererState.materials?.forEach((material) => material?.dispose?.());
  rendererState.geometries?.forEach((geometry) => geometry?.dispose?.());
  rendererState.renderer?.domElement?.remove();
  rendererState.renderer?.dispose?.();
  activeTransition.rendererState = null;
}

function cleanupTransition() {
  cleanupRendererOnly();
  const overlay = document.getElementById(OVERLAY_ID);
  overlay?.remove();
  activeTransition = null;
}

function ensureOverlay() {
  cleanupTransition();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'profile-frame-transition';
  overlay.innerHTML = `
    <div class="profile-frame-transition__stage" id="${OVERLAY_ID}Stage"></div>
    <div class="profile-frame-transition__spines" id="${SPINES_ID}" aria-hidden="true"></div>
    <div class="profile-frame-transition__circle" id="${CIRCLE_ID}" aria-hidden="true">
      <img class="profile-frame-transition__circle-img" src="${PHOTO_URL}" alt="">
      <img class="profile-frame-transition__circle-avatar" alt="">
    </div>
  `;
  document.body.appendChild(overlay);

  const stage = overlay.querySelector('.profile-frame-transition__stage');
  const circle = overlay.querySelector(`#${CIRCLE_ID}`);
  const circleImg = overlay.querySelector('.profile-frame-transition__circle-img');
  const avatarImg = overlay.querySelector('.profile-frame-transition__circle-avatar');
  if (!(stage instanceof HTMLElement) || !(circle instanceof HTMLElement)
    || !(circleImg instanceof HTMLImageElement) || !(avatarImg instanceof HTMLImageElement)) {
    overlay.remove();
    return null;
  }

  activeTransition = {
    overlay,
    stage,
    circle,
    circleImg,
    avatarImg,
    spinesHost: overlay.querySelector(`#${SPINES_ID}`),
    rendererState: null,
    handoff: null,    // { left, top, size } — circle rect frozen from WebGL
    settling: false,  // guard: the bounce/land sequence runs exactly once
  };
  return activeTransition;
}

/* Place the CSS circle exactly where the WebGL photo was pulled to, so the
   handoff from 3D to 2D is seamless. `rect` is in CSS pixels. */
function freezeCircleAt(rect) {
  if (!activeTransition) return;
  const { circle } = activeTransition;
  const size = Math.min(rect.width, rect.height);
  const left = rect.left + (rect.width - size) / 2;
  const top = rect.top + (rect.height - size) / 2;
  circle.style.left = `${left}px`;
  circle.style.top = `${top}px`;
  circle.style.width = `${size}px`;
  circle.style.height = `${size}px`;
  activeTransition.handoff = { left, top, size };
  activeTransition.overlay.classList.add('is-circle-ready');
}

/* Find the glb's photo mesh (the one whose material is the "Image" placeholder)
   so we can swap its texture for our photo and pull just that mesh out in Act 2. */
function findImageMesh(model) {
  let found = null;
  model.traverse((node) => {
    if (found || !node.isMesh || !node.material) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    if (mats.some((m) => String(m.name || '').toLowerCase().includes('image'))) {
      found = node;
    }
  });
  return found;
}

export function playFrameFlyIn(opts = {}) {
  const duration = opts.duration ?? 3600;

  return new Promise((resolve) => {
    if (prefersReducedMotion()) {
      cleanupTransition();
      resolve();
      return;
    }

    const transition = ensureOverlay();
    if (!transition) {
      resolve();
      return;
    }

    const { overlay, stage } = transition;

    let settled = false;
    const finish = (keepOverlay = false) => {
      if (settled) return;
      settled = true;
      cleanupRendererOnly();
      if (!keepOverlay) cleanupTransition();
      resolve();
    };

    const w = window.innerWidth;
    const h = window.innerHeight;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      cleanupTransition();
      resolve();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 100);
    camera.position.set(0, 0, 4.6);

    const key = new THREE.DirectionalLight(0xffe3b2, 2.4);
    key.position.set(2.8, 3.2, 4.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xa3b4ca, 0.88);
    fill.position.set(-3.2, -0.5, -1.7);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0xffffff, 0.66));

    const pivot = new THREE.Group();
    scene.add(pivot);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const textureLoader = new THREE.TextureLoader();
    const prepTex = (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = true;
      // Mipmaps + trilinear + anisotropy — without these the down-scaled
      // photo aliases into a blocky "mosaic" as the frame moves.
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = maxAniso;
      tex.needsUpdate = true;
      return tex;
    };
    const photoTex = prepTex(textureLoader.load(PHOTO_URL));

    activeTransition.rendererState = {
      renderer,
      raf: 0,
      hardTimeout: window.setTimeout(() => finish(false), duration + 1800),
      textures: [photoTex],
      materials: [],
      geometries: [],
    };

    requestAnimationFrame(() => overlay.classList.add('is-active'));

    const loader = new GLTFLoader();
    loader.load(
      FRAME_URL,
      (gltf) => {
        const frame = gltf.scene;
        const box = new THREE.Box3().setFromObject(frame);
        const span = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(span.x, span.y, span.z) || 1;
        // Keep the lifted frame well within the viewport — small enough that it
        // reads as a real object resting in space, never an oppressive panel
        // filling the screen, and with ample room for the photo to pull forward.
        const baseScale = 1.15 / maxDim;
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(baseScale);
        frame.scale.setScalar(baseScale);
        frame.position.sub(center);
        pivot.add(frame);

        // Texture the glb's OWN image mesh — never a separate plane — so the
        // photo sits exactly in the real opening at the real size. We keep a
        // reference to this mesh so Act 2 can pull just the photo forward out
        // of the wood while every other frame part fades away.
        const imageMesh = findImageMesh(frame);
        let photoMat = null;
        if (imageMesh) {
          // Clone the glb's OWN image material (keeps its correct UVs/winding —
          // a fresh material breaks the orientation) and just swap the map +
          // strip the extra ao/normal/rough maps that caused the mosaic.
          const baseMat = Array.isArray(imageMesh.material) ? imageMesh.material[0] : imageMesh.material;
          photoMat = baseMat.clone();
          photoMat.map = photoTex;
          photoMat.aoMap = null;
          photoMat.normalMap = null;
          photoMat.roughnessMap = null;
          photoMat.metalnessMap = null;
          photoMat.emissiveMap = null;
          photoMat.alphaMap = null;
          photoMat.transparent = true;
          photoMat.opacity = 1;
          photoMat.color?.set?.(0xffffff);
          photoMat.emissive?.set?.(0x000000);
          if ('roughness' in photoMat) photoMat.roughness = 0.9;
          if ('metalness' in photoMat) photoMat.metalness = 0;
          photoMat.needsUpdate = true;
          imageMesh.material = photoMat;
          activeTransition.rendererState.materials.push(photoMat);
        }

        const start = performance.now();
        // Act 1 — the frame lifts out of the scene: it lands centred, tilted a
        // touch so its wooden thickness reads as a real object, then turns
        // upright. Act 2 — the photo is pulled forward out of the wood while
        // every other frame part fades away. No in-frame story swap.
        const LIFT_END = 0.34;      // Act 1a — settle in, hold the 3D tilt
        const SQUARE_END = 0.60;    // Act 1b — rotate upright, square to camera
        const PULLOUT_START = 0.70; // brief hold, then Act 2 pull-out

        const projectToScreen = (vec3) => {
          const p = vec3.clone().project(camera);
          return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
        };

        // Base local transform of the image mesh, so Act 2 can offset from it.
        const photoHome = imageMesh ? imageMesh.position.clone() : null;

        // Y offset that places the settled frame in the lower half of the
        // viewport — gives the photo plenty of upward travel room when it
        // pulls out of the wood before landing on the spine row below.
        const FRAME_Y = -0.30;

        const tick = (now) => {
          const t = clamp01((now - start) / duration);

          if (t < LIFT_END) {
            // Act 1a — frame eases in from the side and settles in the lower
            // half, tilted so its wooden thickness reads as a real object.
            const e = easeOut(t / LIFT_END);
            pivot.scale.setScalar(0.5 + 0.5 * e);
            pivot.rotation.y = THREE.MathUtils.lerp(-0.92, -0.28, e);
            pivot.rotation.x = THREE.MathUtils.lerp(0.2, 0.1, e);
            pivot.rotation.z = THREE.MathUtils.lerp(0.07, 0.02, e);
            pivot.position.set(0.5 * (1 - e), 0.14 * (1 - e) + FRAME_Y * e, -0.6 * (1 - e));
          } else if (t < SQUARE_END) {
            // Act 1b — the held tilt rotates upright so the photo faces us
            // square-on, ready to be pulled out.
            const e = easeInOut((t - LIFT_END) / (SQUARE_END - LIFT_END));
            pivot.scale.setScalar(1.0 + 0.04 * e);
            pivot.rotation.y = THREE.MathUtils.lerp(-0.28, 0, e);
            pivot.rotation.x = THREE.MathUtils.lerp(0.1, 0, e);
            pivot.rotation.z = THREE.MathUtils.lerp(0.02, 0, e);
            pivot.position.set(0, FRAME_Y, 0);
          } else if (t < PULLOUT_START) {
            // Brief hold, perfectly square to camera.
            pivot.scale.setScalar(1.04);
            pivot.rotation.set(0, 0, 0);
            pivot.position.set(0, FRAME_Y, 0);
          } else {
            // Act 2 — pull the photo forward/up out of the wood; fade every
            // other frame part away so only the photo remains for the handoff.
            const e = easeInOut((t - PULLOUT_START) / (1 - PULLOUT_START));
            pivot.scale.setScalar(1.04);
            pivot.rotation.set(0, 0, 0);
            pivot.position.set(0, FRAME_Y, 0);
            if (imageMesh && photoHome) {
              imageMesh.position.set(
                photoHome.x,
                photoHome.y + 0.14 * e / Math.max(baseScale, 0.0001),
                photoHome.z + 0.9 * e / Math.max(baseScale, 0.0001),
              );
            }
            frame.traverse((node) => {
              if (node === imageMesh || !node.isMesh || !node.material) return;
              const mats = Array.isArray(node.material) ? node.material : [node.material];
              mats.forEach((m) => { m.transparent = true; m.opacity = 1 - e; });
            });
          }

          renderer.render(scene, camera);

          if (t < 1) {
            activeTransition.rendererState.raf = requestAnimationFrame(tick);
          } else if (imageMesh) {
            // Freeze: project the photo mesh's screen rect for the CSS circle.
            imageMesh.updateWorldMatrix(true, false);
            const dBox = new THREE.Box3().setFromObject(imageMesh);
            const corners = [
              new THREE.Vector3(dBox.min.x, dBox.max.y, dBox.max.z),
              new THREE.Vector3(dBox.max.x, dBox.min.y, dBox.max.z),
            ].map(projectToScreen);
            const rect = {
              left: Math.min(corners[0].x, corners[1].x),
              top: Math.min(corners[0].y, corners[1].y),
              width: Math.abs(corners[1].x - corners[0].x),
              height: Math.abs(corners[1].y - corners[0].y),
            };
            freezeCircleAt(rect);
            finish(true);   // keep overlay; CSS takes over for bounce + landing
          } else {
            finish(true);
          }
        };

        activeTransition.rendererState.raf = requestAnimationFrame(tick);
      },
      undefined,
      () => finish(false)
    );
  });
}

/* Build the temporary decorative spine row the circle hops across — pure
   transition props (mock data), torn down with the overlay. */
function buildSpineRow(spinesHost) {
  if (!(spinesHost instanceof HTMLElement)) return [];
  // A fuller shelf — the ball needs several keys to hop across, left → right.
  const picks = [
    SHELF_BOOKS[1], SHELF_BOOKS[6], SHELF_BOOKS[3], SHELF_BOOKS[14], SHELF_BOOKS[9],
    SHELF_BOOKS[11], SHELF_BOOKS[7], SHELF_BOOKS[15], SHELF_BOOKS[10], SHELF_BOOKS[5],
  ].filter(Boolean);
  spinesHost.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'profile-frame-transition__spine-row';
  const baseH = Math.min(window.innerHeight * 0.26, 220);
  picks.forEach((book) => {
    const spine = document.createElement('div');
    spine.className = 'profile-frame-transition__spine';
    spine.style.width = `${Math.round((book.w || 36) * 1.0)}px`;
    spine.style.height = `${Math.round(baseH * (book.h || 0.9))}px`;
    spine.style.background = book.spine || '#2b2b2b';
    spine.style.color = book.text || '#e8dfc8';
    spine.style.fontFamily = book.font || "'Fraunces', serif";
    const title = document.createElement('span');
    title.className = 'profile-frame-transition__spine-title';
    title.textContent = book.title || '';
    spine.appendChild(title);
    row.appendChild(spine);
  });
  spinesHost.appendChild(row);
  return Array.from(row.querySelectorAll('.profile-frame-transition__spine'));
}

/* Parabolic hop from `from` to `to`, lerping size; onLand fires near contact. */
function hop(circle, from, to, hopHeight, ms, onLand) {
  return new Promise((resolve) => {
    const start = performance.now();
    let landed = false;
    const step = (now) => {
      const t = clamp01((now - start) / ms);
      const x = from.x + (to.x - from.x) * t;
      const ease = easeInOut(t);
      const y = from.y + (to.y - from.y) * ease - hopHeight * Math.sin(Math.PI * t);
      const size = from.size + (to.size - from.size) * ease;
      circle.style.left = `${x - size / 2}px`;
      circle.style.top = `${y - size / 2}px`;
      circle.style.width = `${size}px`;
      circle.style.height = `${size}px`;
      if (!landed && t >= 0.92) { landed = true; onLand?.(); }
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** @param {Document | HTMLElement} targetRoot */
export async function settleFrameFlyIn(targetRoot = document) {
  if (!activeTransition || !activeTransition.handoff) {
    cleanupTransition();
    return;
  }

  const target = targetRoot.querySelector(TARGET_SELECTOR);
  if (!(target instanceof HTMLElement)) {
    cleanupTransition();
    return;
  }
  const targetRect = target.getBoundingClientRect();
  if (!targetRect.width || !targetRect.height) {
    cleanupTransition();
    return;
  }

  // Guard: the bounce/land sequence must run exactly once. The profile view
  // can re-render (demo shell → real data), each calling maybeSettleFrameFlyIn;
  // without this the ball would bounce twice. Re-point the avatar target on a
  // later call, but never restart the animation.
  if (activeTransition.settling) return;
  activeTransition.settling = true;

  const { overlay, circle, avatarImg, spinesHost, handoff } = activeTransition;

  // The opaque overlay covers the WHOLE page for the entire bounce + fly + spin
  // (globe-fly model): the profile page may render/re-render freely behind it,
  // staying invisible, so nothing ever pops in before the avatar has settled.
  // We only fade the overlay out at the very end. We deliberately do NOT gate
  // individual page elements — the overlay alone guarantees a pure background.

  // Wire the real avatar image so the ball resolves into the portrait at the
  // correct, upright viewing angle once it docks.
  const avatarSource = target.querySelector('.prof-avatar, .prof-avatar--initials') instanceof HTMLImageElement
    ? (target.querySelector('.prof-avatar') && (target.querySelector('.prof-avatar').currentSrc || target.querySelector('.prof-avatar').src)) || ''
    : '';
  if (avatarSource) {
    avatarImg.src = avatarSource;
    circle.classList.add('has-avatar');
  }

  // Lay out the spine row and start the piano-key bounce on the solid ground.
  const spines = buildSpineRow(spinesHost);
  await nextFrame();
  overlay.classList.add('is-bouncing');

  const ballSize = Math.min(handoff.size * 0.42, 96);
  const spineTops = spines
    .map((s) => {
      const r = s.getBoundingClientRect();
      return { el: s, x: r.left + r.width / 2, y: r.top };
    })
    .sort((a, b) => a.x - b.x);   // strict left → right order

  // Where the photo froze (centre of screen, large).
  let cur = {
    x: handoff.left + handoff.size / 2,
    y: handoff.top + handoff.size / 2,
    size: handoff.size,
  };

  // Step 1 — morph square → round and shrink IN PLACE into a small ball (no
  // travel, so nothing flies across the screen). The border-radius transition
  // runs alongside the scale-down so the photo visibly rounds as it shrinks.
  circle.classList.add('is-rounding');
  await hop(circle, cur, { x: cur.x, y: cur.y, size: ballSize }, 0, 420, null);
  cur = { x: cur.x, y: cur.y, size: ballSize };

  // Step 2 — the piano run: hop every OTHER spine, strictly left → right, each
  // landed on exactly once. Skipping a book each time keeps the run short and
  // lively instead of plodding across all ten. The LAST spine is always
  // included so the run ends at the right edge.
  const bouncePicks = spineTops.filter((_, i) => i % 2 === 0);
  if (spineTops.length && bouncePicks[bouncePicks.length - 1] !== spineTops[spineTops.length - 1]) {
    bouncePicks.push(spineTops[spineTops.length - 1]);
  }
  for (let i = 0; i < bouncePicks.length; i += 1) {
    const p = bouncePicks[i];
    const isLast = i === bouncePicks.length - 1;
    const landing = { x: p.x, y: p.y - ballSize * 0.5, size: ballSize };
    // eslint-disable-next-line no-await-in-loop
    await hop(
      circle,
      cur,
      landing,
      Math.max(58, ballSize * 1.45),   // a touch higher — bigger gaps between keys
      Math.max(260, 380 - i * 14),
      () => {
        p.el.classList.add('is-kicked');
        window.setTimeout(() => p.el.classList.remove('is-kicked'), 260);
      },
    );
    cur = landing;
    // On the LAST spine, hold a beat so the round portrait visibly locks and
    // the viewer can read the face. During this hold the shelf fades away, so
    // by the time the ball flies into the page the background is fully pure
    // colour — no books, no other elements anywhere on screen.
    if (isLast) {
      await sleep(220);              // let the lock read before clearing
      overlay.classList.add('is-shelf-clearing');
      await sleep(620);              // wait out the 520ms shelf fade
    }
  }

  // Step 3 — from the LAST spine, glide in one clean low arc straight into the
  // profile banner avatar slot (globe-fly style trajectory, no wild diagonal).
  // Re-query the avatar target FRESH here: the profile may have re-rendered
  // (demo shell → real data) during the bounce, so the slot we measured at the
  // start can be stale/detached. Always land on the live slot.
  const liveTarget = (targetRoot.querySelector(TARGET_SELECTOR) || target);
  const liveRect = liveTarget.getBoundingClientRect();
  const avatarSize = Math.min(liveRect.width, liveRect.height) || Math.min(targetRect.width, targetRect.height);
  const avatarCenter = {
    x: (liveRect.width ? liveRect.left + liveRect.width / 2 : targetRect.left + targetRect.width / 2),
    y: (liveRect.height ? liveRect.top + liveRect.height / 2 : targetRect.top + targetRect.height / 2),
    size: avatarSize,
  };
  const revealNode = liveTarget.querySelector('.prof-avatar, .prof-avatar--initials');

  overlay.classList.add('is-landing');
  await hop(circle, cur, avatarCenter, Math.max(40, avatarSize * 0.45), 640, null);

  // Step 4 — docked in the avatar slot: SPIN ONCE in place (flat 2D turn) and
  // crossfade the close-up into the real portrait, so the round photo locks at
  // the correct upright avatar angle exactly where the page avatar will sit.
  // The page is still entirely hidden behind the opaque overlay.
  circle.classList.add('is-spinning', 'is-avatar-morph');
  await sleep(520);
  circle.classList.remove('is-spinning');
  await sleep(420);   // brief lock so the settled portrait reads clearly

  // Reveal the real page avatar UNDER the docked ball so the swap is seamless
  // the instant the overlay starts to fade.
  if (revealNode instanceof HTMLElement) {
    revealNode.style.opacity = '1';
    revealNode.style.transition = 'none';
  }

  // Step 5 — ONLY NOW fade the opaque overlay out, gradually revealing the rest
  // of the profile page around the already-settled avatar (globe-fly handoff).
  overlay.classList.add('is-finishing');

  await sleep(900);
  if (revealNode instanceof HTMLElement) {
    revealNode.style.transition = '';
    revealNode.style.opacity = '';
  }
  cleanupTransition();
}

/** @param {Document | HTMLElement} targetRoot */
export function maybeSettleFrameFlyIn(targetRoot = document) {
  if (!activeTransition) return;

  let attempts = 0;
  const tick = () => {
    if (!activeTransition) return;
    const target = targetRoot.querySelector(TARGET_SELECTOR);
    if (target instanceof HTMLElement && target.getBoundingClientRect().width > 0) {
      settleFrameFlyIn(targetRoot);
      return;
    }
    attempts += 1;
    if (attempts > 60) {
      cleanupTransition();
      return;
    }
    window.setTimeout(tick, 40);
  };
  tick();
}

export function cancelFrameFlyIn() {
  cleanupTransition();
}
