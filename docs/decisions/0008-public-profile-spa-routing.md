# ADR 0008 — Public Profile Pages: SPA Routing, Not a Cloud Function HTTP Endpoint

**Date:** 2026-05-05  
**Status:** Accepted

---

## Context

Phase 4 requires public profile pages at `marginalia.app/#/p/{slug}`. The P2 plan mentioned a Cloud Function HTTP endpoint at `/p/{slug}`. Two approaches are possible:

**Option A — Cloud Function HTTP endpoint**  
A Firebase Hosting rewrite maps `/p/*` → a Cloud Function that fetches profile data and returns HTML (SSR). The profile page is a separate URL (`marginalia.app/p/slug`, no hash).

**Option B — SPA hash route**  
The existing hash router handles `#/p/{slug}`. The public profile is rendered client-side via the same SPA, reading public Firestore data directly. The URL is `marginalia.app/#/p/slug`.

---

## Decision

**Option B — SPA hash route.**

---

## Rationale

1. **Consistent with existing routing.** Every view in Marginalia uses hash routing (`#shelf`, `#map`, `#book`). A Cloud Function SSR page would be a conceptual exception that requires Hosting rewrite rules, CORS configuration, and a separate HTML shell — none of which exist today.

2. **No duplicate HTML shell.** The SPA already has the nav, fonts, and design tokens loaded. An SSR page would need to reproduce all of this independently, creating two rendering paths to maintain.

3. **Firestore public reads are sufficient.** Firestore Rules can allow `profilePublic === true` documents to be read by unauthenticated clients. No server intermediary is needed for the data layer.

4. **Simpler slug lookup.** A secondary Firestore index on `settings.slug` within the `users` collection enables a direct client-side query. No Cloud Function roundtrip needed.

5. **Deferred SEO.** The hash-route approach means search engine indexing is limited (Googlebot handles `#` routes poorly). This is acceptable for v1 — public profiles are primarily shared as direct links between people, not discovered via search. An SSR upgrade path remains open for P3 if SEO becomes a priority.

---

## Trade-offs Accepted

- **No server-side rendering.** Google will not index `#/p/{slug}` URLs reliably. Accepted for v1.
- **Auth state check on load.** The profile page must gracefully handle the auth-loading window before knowing whether the viewer is signed in.
- **slug uniqueness check still needs a Cloud Function.** Client-side Firestore transactions cannot atomically check-and-reserve a slug safely under concurrent writes. A lightweight HTTP Callable (`profileSlugCheck`) handles this; it is not an SSR endpoint.

---

## Consequences

- `src/profile/profile.ts` — view module registered in `VIEW_REGISTRY`
- `src/core/app.js` — hash router extended to parse `#/p/{slug}` and pass slug param
- `firestore.rules` — `users/{uid}` readable by anyone if `resource.data.settings.profilePublic == true`
- `functions/src/profile-slug-check.ts` — HTTP Callable for uniqueness check only
