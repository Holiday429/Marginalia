---
title: "0009 — i18n: key-based registry with AI sync script"
date: 2026-05-05
status: accepted
---

## Context

Marginalia needs to support multiple UI languages (en first, zh-CN now, others later). The requirements driving this decision:

1. English is the source language. All strings are authored in English first.
2. Only functional UI strings are translated — user-generated content (notes, highlights, book titles) is locale-agnostic.
3. When an English string changes, other locales should not require manual edits. The system should detect the gap and allow a single command to fill it.

## Decision

Use a **key-based string registry** in `src/core/i18n.ts`:

```ts
const locales = {
  en:     { 'nav.shelf': 'Shelf', ... },
  'zh-CN': { 'nav.shelf': '书架', ... },
};

export function t(key: string): string {
  const lang = getCurrentLanguage(); // from EntitlementsStore / auth settings
  return locales[lang]?.[key] ?? locales['en'][key] ?? key;
}
```

Runtime fallback chain: `zh-CN[key] → en[key] → key literal`. This means updated English strings degrade gracefully — zh-CN users see the English string until the next translation pass, not a broken UI.

Alongside this, a sync script at `scripts/i18n-sync.ts` calls the Claude API to translate only keys that are missing or whose English value has changed since the last sync. It writes results back to `i18n.ts` and reports a summary. Run with `npm run i18n:sync`.

The `en` locale is the single source of truth. To add or update a string: edit `en`, run `npm run i18n:sync`, review the diff.

## Adding a new locale

1. Add the locale key to the `locales` object in `i18n.ts` with an empty `{}`.
2. Run `npm run i18n:sync` — it detects the empty locale and translates all keys.
3. Add the locale to the language switcher dropdown in `profile-settings.ts`.

## Alternatives rejected

**Inline fallback only (no sync script)** — acceptable short-term but leads to permanently stale translations as the en strings evolve. Rejected because it violates the requirement that other languages auto-adjust.

**i18next / react-intl** — overkill for this codebase. Both libraries bring ICU message format complexity, pluralization rules, and a separate file-per-locale convention. The total string count (~250) doesn't justify the dependency weight.

**Google Translate API** — less accurate than Claude for product UI copy, especially for the literary/editorial register Marginalia uses. Claude understands the product context from the prompt.

## Consequences

- All functional UI strings must be accessed via `t('key')` — raw English string literals in rendered HTML are a lint violation (enforced by the `i18n:check` script).
- Adding a new language costs ~5 minutes: add the empty locale entry, run the sync script, review the diff.
- The sync script requires `ANTHROPIC_API_KEY` in the local environment (not in `.env` — dev-only tool, not a runtime dependency).
