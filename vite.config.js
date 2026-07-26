import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import { visualizer } from 'rollup-plugin-visualizer';

// Every one of these libraries is already loaded via dynamic import() at its
// one call site (three.js: room entry; firebase: app boot but behind its own
// chunk boundary; amcharts5/d3: map/graph view entry — see
// src/map/map.js loadAmCharts() and src/web/web.js loadD3()). Without an
// explicit manualChunks entry, Rollup's default heuristics can fragment a
// multi-package dependency like d3 or amcharts5 into many small chunks
// instead of one predictable chunk per library — pin them explicitly so the
// chunk graph stays legible and the size-limit budget (package.json) has a
// stable target to check against.
// "vendor-" prefix keeps these chunk names from colliding with app chunks
// that legitimately start with the same word (three-room-view.js would
// otherwise glob-match a "three-*.js" size-limit pattern meant for three.js).
const MANUAL_CHUNK_PACKAGES = {
  'vendor-three': ['three'],
  'vendor-firebase': ['firebase'],
  'vendor-amcharts': ['@amcharts/amcharts5', '@amcharts/amcharts5-geodata'],
  'vendor-d3': ['d3-force', 'd3-selection', 'd3-zoom', 'd3-drag', 'd3-scale', 'd3-array'],
};

function manualChunks(id) {
  for (const [chunkName, packages] of Object.entries(MANUAL_CHUNK_PACKAGES)) {
    if (packages.some((pkg) => id.includes(`/node_modules/${pkg}/`))) return chunkName;
  }
  return undefined;
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/Marginalia/' : './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: { manualChunks },
    },
  },
  plugins: [
    // Debug tool only — inspect chunk composition with `npm run build:analyze`.
    // Not part of the size budget gate; size-limit (package.json) owns that.
    process.env.ANALYZE && visualizer({
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ].filter(Boolean),
  test: {
    // tests/e2e/** are Playwright specs, run via `npm run test:e2e` — keep them
    // out of vitest's collection so the two runners never fight over the same files.
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
});
