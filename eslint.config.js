// Marginalia · ESLint flat config
// Enforces the CLAUDE.md rules that matter for the refactor: no window.* globals,
// no legacy CDN globals (firebase/am5/d3), no console noise in production paths.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const NO_WINDOW_ASSIGN = {
  selector:
    "AssignmentExpression[left.type='MemberExpression'][left.object.name='window'][left.property.name=/^[A-Z]/]",
  message:
    'Do not assign PascalCase globals onto window — import the module directly (see CLAUDE.md "no window.X globals").',
};

// firebase (compat CDN global) is fully removed as of P1 — enforced as an error.
const NO_FIREBASE_GLOBAL = {
  selector: "Identifier[name='firebase']",
  message: 'Bare `firebase` CDN global is banned — import from src/firebase/config.ts (modular SDK).',
};

// am5/d3 are still loaded via CDN <script> until P3 migrates them to npm — warn only for now.
const NO_AM5_D3_GLOBALS = [
  {
    selector: "Identifier[name='am5']",
    message: 'Bare `am5` CDN global is banned — import @amcharts/amcharts5 from npm.',
  },
  {
    selector: "Identifier[name='d3']",
    message: 'Bare `d3` CDN global is banned — import d3 submodules from npm.',
  },
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
      // --- P0/P1: guard rails for the refactor, tightened phase by phase ---
      // window.X= bans stay warn until P2 removes the last assignments (src/main.js, ai-gateway.ts).
      'no-restricted-syntax': ['warn', NO_WINDOW_ASSIGN, ...NO_AM5_D3_GLOBALS],
      // firebase compat global fully eliminated in P1 — error so it can never regress.
      'no-restricted-globals': ['error', { name: 'firebase', message: NO_FIREBASE_GLOBAL.message }],
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
