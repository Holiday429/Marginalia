# Geo region images

The full-bleed hero at the top of the Map detail panel.

## Current source: curated Unsplash URLs (in the profiles)

Each `public/data/geo-profiles/{CC}.json` carries a `hero` block pointing at a
hot-linkable Unsplash CDN URL, with attribution:

```json
"hero": {
  "image": "https://images.unsplash.com/photo-XXXX?auto=format&fit=crop&w=1200&q=70",
  "credit": "Photographer / Unsplash",
  "caption": "one-line reading-context caption"
}
```

Rules:
- Use only openly-licensed images. Unsplash photos are free to use; we keep the
  `credit` line per their attribution guidelines.
- Landscape orientation. The `w=1200&q=70` query keeps payloads light; the panel
  crops to a 200px-tall band.
- Countries without a curated image simply omit the `hero` block — the panel
  degrades to its text-only header (handled by `renderPanelHero`'s `onerror`).

## This directory: reserved for user uploads (future)

`public/data/geo-images/` is reserved for self-hosted images, primarily
**user-uploaded travel photos**. At render time a user's own photo resolves
ahead of the curated image (`userHero ?? hero`), connecting "books read" with
"places travelled". Drop self-hosted files here as `CN.jpg`, `JP.jpg`, … and
point the profile's `hero.image` at `/data/geo-images/{CC}.jpg`.
