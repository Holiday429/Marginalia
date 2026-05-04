# 0003 — Firebase environment split via Vite env files

**Status:** Accepted
**Date:** 2026-05-04

## Context

Phase 4 of the P0 migration requires separate Firebase projects for development and production so that dev data and auth sessions cannot bleed into the production database. Previously `src/firebase/config.js` hardcoded the production Firebase config (including the API key) directly in source.

## Decision

Firebase config values are read exclusively from `import.meta.env.VITE_*` variables, sourced by Vite from `.env.development` (for `npm run dev`) or `.env.production` (for `npm run build`). Neither file is committed. A committed `.env.example` documents all required keys with placeholder values.

- `.firebaserc` carries two project aliases: `prod` → `marginalia-61f37` (existing), `dev` → `marginalia-dev` (new project, created by the user in Firebase Console).
- `src/core/env.ts` is the single typed entry point for all env reads; no other file calls `import.meta.env` directly.
- The `window.MARGINALIA_FIREBASE` shim is kept for now — it is tagged `// TODO(p0-cleanup)` and will be removed when `db.js` and `auth.js` are refactored to import `MARGINALIA_FIREBASE` directly.

## Alternatives considered

- **Single Firebase project with separate Firestore databases** — Firebase supports multiple named databases per project, but Auth, Storage, and Hosting are still shared, which does not provide true isolation. Rejected.
- **Runtime environment detection via hostname** — avoids the need for env files but leaks both configs into the client bundle. Rejected as a security regression.

## Consequences

- `npm run dev` connects to `marginalia-dev` (once the user creates the project and populates `.env.development`).
- `npm run build` with `.env.production` connects to `marginalia-61f37`.
- Sign-in sessions and Firestore data are fully isolated between environments.
- The user must create the `marginalia-dev` Firebase project manually and populate `.env.development` before dev mode can authenticate. Until then, Firebase initialises with `undefined` config values and auth calls will fail — acceptable during migration since the app already works in a no-auth seed-data mode.
- Phase 5 (AI gateway) will read a `VITE_AI_GATEWAY_URL` key; it should be added to `.env.example` at that point.
