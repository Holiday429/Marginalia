/* ==========================================================================
   Marginalia · Picture-frame fly-in transition
   --------------------------------------------------------------------------
   Narrative — scene → action → person, played over a black screen:
   Act 1  A real 3D wooden frame swings in from the side (thickness visible).
          Inside sits frame1 — the whole book-truck scene.
   Act 2  Inside the same frame, the photo scales/crossfades frame1 → frame2
          (the reading close-up). The frame never changes.
   Act 3  frame2 is pulled forward out of the frame; the wood fades. The freed
          square photo becomes a round avatar and bounces, piano-key style,
          across a row of book spines — all on black. It then drops into the
          profile avatar slot. Only AFTER it lands does the profile page fade
          in behind the (then disappearing) overlay.

   The frame opening is textured by aligning our own photo planes to the glb's
   built-in "Image" mesh (which we hide), so the photo fills the real opening
   in correct perspective — never the "Insert Image Here" placeholder.
   ========================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SHELF_BOOKS } from '../data/mock/seed-spines.js';

const FRAME_URL = '/3d/wooden_picture_frame.glb';
const ROOM_PHOTO_URL = '/3d/profile-frame-room.jpg';
const DETAIL_PHOTO_URL = '/3d/profile-frame-detail.jpg';
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

function smoothRange(value, start, end) {
  if (end <= start) return value >= end ? 1 : 0;
  const t = clamp01((value - start) / (end - start));
  return t * t * (3 - 2 * t);
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
      <img class="profile-frame-transition__circle-img" src="${DETAIL_PHOTO_URL}" alt="">
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
    handoff: null,   // { left, top, size } — circle rect frozen from WebGL
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
   so we can both hide it and copy its transform for our own photo planes. */
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
    const roomTex = prepTex(textureLoader.load(ROOM_PHOTO_URL));
    const detailTex = prepTex(textureLoader.load(DETAIL_PHOTO_URL));

    activeTransition.rendererState = {
      renderer,
      raf: 0,
      hardTimeout: window.setTimeout(() => finish(false), duration + 1800),
      textures: [roomTex, detailTex],
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
        const baseScale = 2.2 / maxDim;
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(baseScale);
        frame.scale.setScalar(baseScale);
        frame.position.sub(center);
        pivot.add(frame);

        // Texture the glb's OWN image mesh — never a separate plane — so the
        // photo sits exactly in the real opening at the real size. frame1
        // (room) goes on the built-in material; frame2 (detail) rides on a
        // pixel-perfect clone of that same mesh so we can crossfade and then
        // pull only frame2 out of the wood in Act 3.
        const imageMesh = findImageMesh(frame);
        let detailMesh = null;
        let roomMat = null;
        let detailMat = null;
        if (imageMesh) {
          // Clone the glb's OWN image material (keeps its correct UVs/winding —
          // a fresh material breaks the orientation) and just swap the map +
          // strip the extra ao/normal/rough maps that caused the mosaic.
          const baseMat = Array.isArray(imageMesh.material) ? imageMesh.material[0] : imageMesh.material;
          const cleanMat = (m, tex) => {
            m.map = tex;
            m.aoMap = null;
            m.normalMap = null;
            m.roughnessMap = null;
            m.metalnessMap = null;
            m.emissiveMap = null;
            m.alphaMap = null;
            m.transparent = true;
            m.opacity = 1;
            m.color?.set?.(0xffffff);
            m.emissive?.set?.(0x000000);
            if ('roughness' in m) m.roughness = 0.9;
            if ('metalness' in m) m.metalness = 0;
            m.needsUpdate = true;
            return m;
          };
          roomMat = cleanMat(baseMat.clone(), roomTex);
          imageMesh.material = roomMat;

          detailMesh = imageMesh.clone();
          detailMat = cleanMat(baseMat.clone(), detailTex);
          detailMat.opacity = 0;
          detailMesh.material = detailMat;
          // Nudge the clone a hair toward the camera so it never z-fights.
          detailMesh.position.z += 0.002;
          imageMesh.parent.add(detailMesh);

          activeTransition.rendererState.materials.push(roomMat, detailMat);
        }

        const start = performance.now();
        const SIDE_REVEAL_END = 0.30;   // Act 1 — swing in, show thickness
        const STORY_SWAP_END = 0.66;    // Act 2 — frame1 → frame2 in-frame
        const SETTLE_END = 0.76;        // brief hold on frame2
        // Act 3 Beat A (pull-out) runs SETTLE_END → 1.

        const projectToScreen = (vec3) => {
          const p = vec3.clone().project(camera);
          return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
        };

        // Base local transform of the detail mesh, so Act 3 can offset from it.
        const detailHome = detailMesh ? detailMesh.position.clone() : null;

        const tick = (now) => {
          const t = clamp01((now - start) / duration);

          if (t < SIDE_REVEAL_END) {
            const e = easeOut(t / SIDE_REVEAL_END);
            pivot.scale.setScalar(0.46 + 0.46 * e);
            pivot.rotation.y = THREE.MathUtils.lerp(-1.02, -0.22, e);
            pivot.rotation.x = THREE.MathUtils.lerp(0.22, 0.05, e);
            pivot.rotation.z = THREE.MathUtils.lerp(0.08, 0.01, e);
            pivot.position.set(0.56 * (1 - e), 0.16 * (1 - e), -0.68 * (1 - e));
          } else if (t < STORY_SWAP_END) {
            const e = easeInOut((t - SIDE_REVEAL_END) / (STORY_SWAP_END - SIDE_REVEAL_END));
            // frame2 is a tighter crop of frame1, so the swap reads as a gentle
            // push-in: the whole framed photo eases a touch closer while frame2
            // crossfades up over frame1. No UV mangling (the glb mesh UVs are
            // not 0–1 normalized, so repeat/center would corrupt the image).
            const cross = smoothRange(e, 0.18, 0.92);
            pivot.scale.setScalar(0.92 + 0.10 * e);   // subtle dolly-in
            pivot.rotation.y = THREE.MathUtils.lerp(-0.22, 0, e);
            pivot.rotation.x = THREE.MathUtils.lerp(0.05, 0, e);
            pivot.rotation.z = THREE.MathUtils.lerp(0.01, 0, e);
            pivot.position.set(0, 0, 0);
            if (roomMat) roomMat.opacity = 1 - cross;
            if (detailMat) detailMat.opacity = cross;
          } else if (t < SETTLE_END) {
            const e = easeInOut((t - STORY_SWAP_END) / (SETTLE_END - STORY_SWAP_END));
            pivot.scale.setScalar(1.02 + 0.02 * e);
            pivot.rotation.set(0, 0, 0);
            pivot.position.set(0, 0, 0);
            if (roomMat) roomMat.opacity = 0;
            if (detailMat) detailMat.opacity = 1;
          } else {
            // Act 3 Beat A — pull frame2 forward/down out of the wood; fade
            // every other frame part away so only the photo remains.
            const e = easeInOut((t - SETTLE_END) / (1 - SETTLE_END));
            if (roomMat) roomMat.opacity = 0;
            if (detailMat) detailMat.opacity = 1;
            if (detailMesh && detailHome) {
              detailMesh.position.set(
                detailHome.x,
                detailHome.y - 0.16 * e / Math.max(baseScale, 0.0001),
                detailHome.z + 0.9 * e / Math.max(baseScale, 0.0001),
              );
            }
            frame.traverse((node) => {
              if (node === detailMesh || !node.isMesh || !node.material) return;
              const mats = Array.isArray(node.material) ? node.material : [node.material];
              mats.forEach((m) => { m.transparent = true; m.opacity = 1 - e; });
            });
          }

          renderer.render(scene, camera);

          if (t < 1) {
            activeTransition.rendererState.raf = requestAnimationFrame(tick);
          } else if (detailMesh) {
            // Freeze: project the detail mesh's screen rect for the CSS circle.
            detailMesh.updateWorldMatrix(true, false);
            const dBox = new THREE.Box3().setFromObject(detailMesh);
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

  const { overlay, circle, avatarImg, spinesHost, handoff } = activeTransition;

  // Keep the page hidden behind the opaque overlay until the circle lands.
  const panel = document.getElementById('panel-profile');
  if (panel instanceof HTMLElement) {
    panel.style.opacity = '0';
    panel.style.transition = 'none';
  }

  // Wire the real avatar image so the circle resolves into the portrait.
  const revealNode = target.querySelector('.prof-avatar, .prof-avatar--initials');
  const avatarSource = revealNode instanceof HTMLImageElement
    ? (revealNode.currentSrc || revealNode.src || '')
    : '';
  if (avatarSource) {
    avatarImg.src = avatarSource;
    circle.classList.add('has-avatar');
  }

  // Lay out the spine row and start the piano-key bounce on black.
  const spines = buildSpineRow(spinesHost);
  await nextFrame();
  overlay.classList.add('is-bouncing');

  const avatarSize = Math.min(targetRect.width, targetRect.height);
  const avatarCenter = {
    x: targetRect.left + targetRect.width / 2,
    y: targetRect.top + targetRect.height / 2,
    size: avatarSize,
  };

  const ballSize = Math.min(handoff.size * 0.42, 96);
  const spineTops = spines
    .map((s) => {
      const r = s.getBoundingClientRect();
      return { el: s, x: r.left + r.width / 2, y: r.top };
    })
    .sort((a, b) => a.x - b.x);   // guarantee strict left → right order

  // Where the photo froze (centre of screen, large).
  let cur = {
    x: handoff.left + handoff.size / 2,
    y: handoff.top + handoff.size / 2,
    size: handoff.size,
  };

  // Step 1 — shrink IN PLACE into a small ball (no travel, so nothing flies
  // across the screen). Just a quick scale-down where it already is.
  await hop(circle, cur, { x: cur.x, y: cur.y, size: ballSize }, 0, 360, null);
  cur = { x: cur.x, y: cur.y, size: ballSize };

  // Step 2 — the piano run. Visit only spines from the ball's position
  // RIGHTWARD, in order, each exactly once. Never hops backward/left, so it
  // reads as a clean left-to-right run with no repeats and no wild arcs.
  const run = spineTops.filter((p) => p.x >= cur.x - ballSize);
  const sequence = run.length ? run : spineTops;
  for (let i = 0; i < sequence.length; i += 1) {
    const p = sequence[i];
    // eslint-disable-next-line no-await-in-loop
    await hop(
      circle,
      cur,
      { x: p.x, y: p.y - ballSize * 0.5, size: ballSize },
      Math.max(50, ballSize * 1.3),
      Math.max(240, 360 - i * 16),
      () => {
        p.el.classList.add('is-kicked');
        window.setTimeout(() => p.el.classList.remove('is-kicked'), 260);
      },
    );
    cur = { x: p.x, y: p.y - ballSize * 0.5, size: ballSize };
  }

  // At the RIGHT end: the ball settles, SPINS in place, and the close-up
  // crossfades into the round portrait — then glides in one clean low arc to
  // the profile avatar slot (no wild diagonal flight across the screen).
  circle.classList.add('is-spinning', 'is-avatar-morph');
  await sleep(520);
  circle.classList.remove('is-spinning');
  overlay.classList.add('is-landing');
  // Low hop height keeps the path tight and intentional.
  await hop(circle, cur, avatarCenter, Math.max(40, avatarSize * 0.45), 640, null);

  // Landed in the avatar slot. Let the circle visibly LOCK in place before
  // anything else moves — the page stays fully hidden behind black.
  if (revealNode instanceof HTMLElement) {
    revealNode.style.opacity = '0';
    revealNode.style.transition = 'none';
  }
  await sleep(520);

  // Reveal the real page avatar UNDER the docked circle (seamless swap), and
  // hold again so it clearly reads as settled before the page joins.
  if (revealNode instanceof HTMLElement) {
    revealNode.style.transition = 'opacity 360ms ease';
    revealNode.style.opacity = '1';
  }
  await sleep(420);

  // Only NOW fade the black overlay away — slowly — so the rest of the profile
  // page emerges gradually around the already-settled avatar, never popping in.
  if (panel instanceof HTMLElement) {
    panel.style.transition = 'opacity 760ms ease';
    panel.style.opacity = '1';
  }
  overlay.classList.add('is-finishing');

  await sleep(900);
  if (panel instanceof HTMLElement) {
    panel.style.transition = '';
    panel.style.opacity = '';
  }
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
