// Marginalia · static asset URL helper.
// Everything under public/ must be referenced through asset() so the Vite `base`
// (relative './' by default, '/Marginalia/' on GitHub Pages) is applied in one place.

export function asset(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}
