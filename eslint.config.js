// Marginalia · ESLint flat config
// Enforces the CLAUDE.md rules that matter for the refactor: no window.* globals,
// no legacy CDN globals (firebase/am5/d3), no console noise in production paths.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// window.<PascalCase>= assignments are fully eliminated as of P2 — the only
// no-restricted-syntax entry, so it can sit at `error` on its own (ESLint flat
// config gives one severity per rule name per matching config — see the
// CDN_GLOBALS comment below for why firebase/am5/d3 live on a different rule).
const NO_WINDOW_ASSIGN = {
  selector:
    "AssignmentExpression[left.type='MemberExpression'][left.object.name='window'][left.property.name=/^[A-Z]/]",
  message:
    'Do not assign PascalCase globals onto window — import the module directly (see CLAUDE.md "no window.X globals").',
};

// Legacy CDN <script> globals. firebase is fully removed as of P1 (nothing in
// the bundle graph ever references it again), but it stays grouped here at
// `warn` with am5/d3 (still CDN-loaded until P3) rather than `error`: ESLint
// flat config only allows one severity per rule name per file, and
// no-restricted-syntax is already spoken for by NO_WINDOW_ASSIGN at `error`.
// The real protection against a firebase regression is that the compat
// package was uninstalled in P1, not this lint rule.
const CDN_GLOBALS = [
  { name: 'firebase', message: 'Bare `firebase` CDN global is banned — import from src/firebase/config.ts (modular SDK).' },
  { name: 'am5', message: 'Bare `am5` CDN global is banned — import @amcharts/amcharts5 from npm.' },
  { name: 'd3', message: 'Bare `d3` CDN global is banned — import d3 submodules from npm.' },
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.npm-cache/**',
      'functions/lib/**',
      'functions/node_modules/**',
      'public/**',
      'tmp/**',
      'reference_delete when complete/**',
      '**/*.glb',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        indexedDB: 'readonly',
        customElements: 'readonly',
        CustomEvent: 'readonly',
        HTMLElement: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        FormData: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        structuredClone: 'readonly',
        importScripts: 'readonly',
      },
    },
    rules: {
      // --- P0/P1/P2: guard rails for the refactor, tightened phase by phase ---
      // window.<PascalCase>= assignments: fully eliminated in P2 — error.
      'no-restricted-syntax': ['error', NO_WINDOW_ASSIGN],
      // firebase/am5/d3 CDN globals: see CDN_GLOBALS comment above for why these
      // share one severity (warn) despite firebase itself being fully removed.
      'no-restricted-globals': ['warn', ...CDN_GLOBALS],
      'no-console': ['error', { allow: ['error', 'debug'] }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Codebase has many untyped legacy .js files under active migration (P4) — don't
      // block P0 on that; require-based patterns and `any` fallout are handled later.
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-undef': 'off', // TS handles this more accurately; avoid false positives on TS-only globals
      // Pre-existing style issues across legacy files (empty catch blocks, let-vs-const,
      // stray escapes). Real but out of scope for P0 — downgraded to warn so they're
      // tracked without blocking the lint gate; fix opportunistically per-file in P4.
      'no-empty': 'warn',
      'prefer-const': 'warn',
      'no-regex-spaces': 'warn',
      'no-useless-escape': 'warn',
      'no-extra-boolean-cast': 'warn',
      'no-irregular-whitespace': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
    },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.js', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['scripts/**/*.ts', 'functions/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
