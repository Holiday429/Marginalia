# 0002 — hero-glb.js kept as HTML script tag, not bundled by Vite

**Status:** Accepted
**Date:** 2026-05-01

## Context

Phase 1 introduced Vite as the build system. Most `src/` files moved into `src/main.js` as bare imports. Two scripts were originally marked as `type="module"` in `index.html`: `src/studio/room-scene.js` and `src/preloader/hero-glb.js`. During Phase 1 it was discovered that `room-scene.js` does not exist on disk (removed in a prior commit). `hero-glb.js` imports Three.js via full CDN `https://` URLs rather than bare specifiers, and is also dynamically imported by `src/booklist/booklist.js` to get `mountHeroGLB`.

## Decision

`hero-glb.js` stays as a `<script type="module">` tag in `index.html`, outside Vite's main bundle. Its Three.js imports use full CDN URLs which Vite passes through without resolution. The dynamic import in `booklist.js` was corrected from `'./src/preloader/hero-glb.js'` (broken root-relative path) to `'../preloader/hero-glb.js'` (correct relative path); Vite de-dupes the module since it is already a static entry.

## Alternatives considered

- **Install three as an npm dep and let Vite bundle hero-glb.js** — correct long-term approach, but Phase 1 scope excludes source changes. Deferred to Phase 3 (window.X → M.* refactor) when Three.js will be properly wired as an npm dependency.
- **Remove hero-glb.js from index.html and rely solely on the dynamic import from booklist.js** — would work but changes runtime behavior and requires source edits, out of Phase 1 scope.

## Consequences

- `hero-glb.js` is not tree-shaken or hashed by Vite in production — minor issue, acceptable for Phase 1.
- Phase 3 should install `three` as an npm dependency, remove the CDN `<script type="module">` tag, and let Vite bundle `hero-glb.js` normally. At that point the static entry in `index.html` can be removed and the dynamic import in `booklist.js` becomes the sole load path.
- The dead `room-scene.js` script tag has been permanently removed. If 3D library work requires a room scene, it will be created as a new file under `src/views/library-3d/` per the target view structure in `CLAUDE.md`.
