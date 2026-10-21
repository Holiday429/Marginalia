# Design tokens — naming and migration (Phase 3.3)

Status: applied page by page. Migrated so far: Room (see `scripts/colors-migrated.txt`). Source of truth stays `src/core/base.css`.

## Principle

The token layer already exists and already has semantic names (`--text-*`, `--panel-*`, `--glass-*`, per-view
rebinding through `body[data-view]`). The problem is not missing names, it is that ~1,200 colour literals and
~700 font-size literals in component CSS bypass them. So: **keep the existing names, fill the gaps, then migrate
component CSS onto them.** No big-bang rename; raw `--color-*` atoms stay as they are.

## Canonical tokens (what components may use)

| Role | Token | Today it is |
|---|---|---|
| Page background | `--bg-tool` | `--color-smoke-bg` |
| Text | `--text-primary` / `--text-secondary` / `--text-muted` | ivory at 100 / 78 / 54 % |
| Control surface (resting / hover / selected) | `--glass-fill` / `--glass-fill-hover` / `--glass-fill-active` | ivory at 4 / 8 / 14 % |
| Panel surface | `--glass-panel` / `--glass-panel-soft` | warm smoke at 50 / 40 % |
| Border | `--panel-border` / `--panel-border-strong` / `--glass-border-active` | ivory at 16 / 28 / 42 % |
| Accent | `--accent-gold` (brass edge), `--color-gold-warm` (highlight) | |
| **New** floating control (pills, camera bar, Today) | `--float-surface`, `--float-border`, `--float-shadow` | the recipe used in 3.2: smoke 74 %, brass 45 %, soft shadow |
| **New** status | `--status-positive` / `--status-negative` / `--status-warning` | sage / rose / gold-warm |
| **New** overlay | `--scrim`, `--shadow-soft`, `--shadow-lift` | the `rgba(0,0,0,.2–.5)` family |
| Light surfaces (book, cultural context) | `--bg`, `--ink`, `--paper`, `--rule` | already rebound per view |

Rules: components use only the tokens above (never `--color-*` atoms, never literals); a one-off alpha is written
`color-mix(in srgb, var(--token) N%, transparent)`.

## Type scale

Exposed as `--fs-11 … --fs-40` (see below); the other `--fs-*` steps are legacy and are removed when the last page is migrated.

**Decided (owner approved the caption step).** 250+ literals are below 12 px (10 px ×93, 11 px ×74, 9 px ×51, 8 px ×19, 8.5 px ×14): mono
captions, nav labels (9 px in 78 px columns), heatmap labels, notes-wall meta. Snapping them all to 12 px grows them
20–50 % and will overflow several dense components. `--fs-11` is the caption step and 8–11 px snap to it. The scale is 11 / 12 / 14 / 16 / 20 / 28 / 40, with 48 and 72 kept as a separate display tier for large numerals. Mapping: ≤11.5 → 11, ≤12.5 → 12, ≤14.5 → 14, ≤17.5 → 16, ≤22.5 → 20, ≤32.5 → 28, ≤44.5 → 40.

## Migration

Per page, one commit each, three-size screenshots (390 / 768 / 1440) compared before and after:
Room → Library → Book → Profile → Map / Graph.

There are 715 distinct colour literals (the most common appears 25 times), so this is judgement work, not
find-and-replace. Most are alpha variants of four families (ivory `232,223,200`, ink `26,23,20`, black, white),
which map onto the tokens above; a literal with no sensible token is a signal to add one, not to keep the literal.

Gate: a new `npm run check:colors` fails on any colour or `font-size` literal in a file listed in
`scripts/colors-migrated.txt`. A page is added to the list in the commit that migrates it, so the rule tightens
page by page and never blocks work on pages not yet reached. `check:colors` joins `check:all`.

## Added in 3.3 (Room batch)

Atoms: `--color-umber`, `--color-umber-soft` (warm dark glass base), `--color-kraft` (kraft paper / wood mid-brown).
Semantic: `--float-surface`, `--float-surface-solid`, `--float-border`, `--float-blur`, `--float-shadow` (one material for every
floating control over the room: menu, navigation, camera bar, Today, focus dock, settings, hover tip), `--status-*`, `--scrim`,
`--shadow-soft`, `--shadow-lift`, `--fs-40`. Colour literals were mapped by family (ivory, ink, umber, gold, rose, sage, kraft)
with `color-mix(in srgb, var(--token) N%, transparent)` for alpha, so near-duplicates such as `rgba(244,228,205,…)` and
`rgba(249,235,213,…)` now resolve to the same token.

## Not in scope

New themes, light/dark switching, renaming the raw `--color-*` atoms, retiring the legacy spacing scale.
