# iPad Baseline — P1 Audit

> Completed: 2026-05-05 (Phase 8)  
> Target device: iPad Air (768px × 1024px, Safari, coarse pointer)

---

## What was fixed

### Touch targets < 44px
All fixes applied via `@media (pointer: coarse)` — they only fire on touch screens, not desktop trackpads.

| Element | File | Before | After |
|---|---|---|---|
| `.nav-room-btn` (shelf) | `shelf.css` | 28px | 44px |
| `.shelf-filters .chip` | `shelf.css` | 30px | 44px |
| `.shelf-search input` | `shelf.css` | 38px | 44px |
| `.book-tab-btn` (horizontal mode) | `book.css` | ~25px | 44px |
| AI panel header buttons (regen, edit, revert, dismiss) | `book.css` | ~24px | 44px |
| `.booklist-export__btn` | `booklist.css` | ~34px | 44px |
| Library search input | `library-2d.css` | 38px | 44px |
| Library rail/topbar buttons | `library-2d.css` | varies | 44px |
| AI edit inline Save/Cancel buttons | `ai.css` | — | 44px (built in) |

### PWA / Add to Home Screen
- Added `public/manifest.json` (display: standalone, theme: #1a1714)
- Added `<link rel="manifest">`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon` to `index.html`
- Added `viewport-fit=cover` for iPhone notch / Dynamic Island safe areas

### AI output editing
- AI results stored in Firestore as `AiBlock<T>` (`original` / `userEdited?` / `generatedAt` / `promptVersion`)
- Inline pencil → textarea → Save/Cancel edit flow in every AI output panel
- Regenerate clears `userEdited` before re-running; Revert restores `original`

---

## Known remaining issues

### PWA icon
`public/icon.svg` is a placeholder SVG. iOS Safari requires PNG icons for the "Add to Home Screen" splash screen and app icon to render correctly. PNG icons at 180×180 and 512×512 need to be produced from the brand assets and added to `public/manifest.json`.

**Priority:** Medium — PWA installs but the icon shows a blank/generic placeholder on iOS.

### 3D room performance fallback
The performance-based fallback from Library 3D → Library 2D is not yet implemented. The current code checks GPU tier at load time (via `three-room-view.js`), but does not monitor framerate at runtime and trigger a fallback if it drops below 30fps.

**Priority:** Low for P1 — the 3D room is gated on the `library.3d` entitlement (Pro only), so free users never see it. Implement in P2 when the 3D room gets the full shelf-wall slot.

### Book view at 768px (landscape)
In landscape orientation on iPad (1024px wide), the book detail view falls into the `≤1080px` breakpoint and collapses the outline nav to horizontal scroll. This works but the sidebar toggle button is hidden. The horizontal tab row can overflow on books with many sections.

**Priority:** Low — functional, not broken.

### Map view at 768px
The amCharts map is responsive but the detail panel (book list overlay) can be clipped at 768px portrait if many books share a location. No fix applied in Phase 8.

**Priority:** Low — edge case.

### Booklist source-track chips
The year/source filter track in the booklist becomes horizontally scrollable at 980px. The individual chip `min-height: 44px` fix was applied, but chips may still be narrower than 44px for short labels.

**Priority:** Low — the scrollable track compensates for narrow chips.

---

## Breakpoint coverage after Phase 8

| Viewport | Book | Shelf | Library 2D | Booklist | Map | 3D Room |
|---|---|---|---|---|---|---|
| 360px | ✓ | ✓ | ✓ | ✓ | ✓ | n/a (hidden) |
| 640px | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| 768px (iPad portrait) | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| 1024px (iPad landscape) | ✓ | ✓ | ✓ | ✓ | ✓ | Pro only |
| 1280px | ✓ | ✓ | ✓ | ✓ | ✓ | Pro only |
| 1440px+ | ✓ | ✓ | ✓ | ✓ | ✓ | Pro only |
