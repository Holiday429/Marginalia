import { toPng } from 'html-to-image';
import { logError } from '../services/analytics.ts';

export interface SnapshotResult {
  dataUrl: string;
  blob: Blob;
}

const CARD_WIDTH = 1200;

/**
 * Elements fully removed from layout during capture (collapse, no trailing
 * whitespace). The CTA lives here so the image ends right after the shelf.
 */
const COLLAPSE_SELECTORS = [
  '.prof-share-cta',
  '.panel-header',
  '.primary-tabs',
];

/** Elements hidden but keeping their layout box (preserves surrounding spacing). */
const HIDE_SELECTORS = [
  '.prof-map-zoom',
  '.prof-map-pills',
  '.prof-map-play-btn',
  '.prof-map-rail',
  '.prof-rid-btn--ghost',          // Re-divine button
  '.booklist-play-btn',
  '.booklist-section-head--source',
  '.prof-annual__shelf-controls',
];

function setDisplay(els: HTMLElement[], hidden: boolean): void {
  els.forEach((el) => { el.style.display = hidden ? 'none' : ''; });
}

function setVisibility(els: HTMLElement[], hidden: boolean): void {
  els.forEach((el) => { el.style.visibility = hidden ? 'hidden' : ''; });
}

/** Resolve a CSS custom property as computed on `el` (respects scoped overrides). */
function resolveVar(el: HTMLElement, name: string, fallback: string): string {
  const val = getComputedStyle(el).getPropertyValue(name).trim();
  return val || fallback;
}

/**
 * The dark profile tokens (--bg-tool, --ink, --gold, …) are scoped to
 * `#panel-profile`, not :root — :root still holds the light taupe defaults.
 * html-to-image clones the target into an offscreen SVG context that loses
 * those ancestor-scoped overrides, so the clone would fall back to the light
 * theme. Read the *computed* values from the live target (which inherits the
 * profile scope) and stamp them onto the clone root so descendants resolve
 * the same colours they show on screen.
 */
function buildCssVarOverrides(el: HTMLElement): string {
  const style = getComputedStyle(el);
  const vars = [
    '--bg', '--bg-soft', '--bg-deep', '--ink', '--ink-soft',
    '--muted', '--muted-soft', '--muted-faint', '--paper', '--surface',
    '--rule', '--rule-strong', '--rule-soft',
    '--accent', '--accent-gold', '--gold', '--gold-bright',
    '--glass-border', '--glass-border-soft', '--glass-panel', '--glass-panel-soft', '--glass-blur',
    '--panel-border', '--panel-border-strong',
    '--text-primary', '--text-secondary',
    '--bg-tool', '--bg-tool-soft',
  ];
  const pairs: string[] = [];
  vars.forEach((v) => {
    const val = style.getPropertyValue(v).trim();
    if (val) pairs.push(`${v}:${val}`);
  });
  return pairs.join(';');
}

export async function captureProfileSnapshot(container: HTMLElement): Promise<SnapshotResult> {
  const target = container.querySelector<HTMLElement>('.prof-shell__inner');
  if (!target) throw new Error('Profile content area not found.');

  const toCollapse = COLLAPSE_SELECTORS.flatMap((sel) =>
    Array.from(target.querySelectorAll<HTMLElement>(sel)),
  );
  const toHide = HIDE_SELECTORS.flatMap((sel) =>
    Array.from(target.querySelectorAll<HTMLElement>(sel)),
  );
  setDisplay(toCollapse, true);
  setVisibility(toHide, true);
  target.style.overflow = 'visible';

  // Resolved bg colour for the canvas fill (avoids transparent / wrong-colour gaps).
  const bgColor = resolveVar(target, '--bg-tool', '#302e2a');
  const cssVarStyle = buildCssVarOverrides(target);

  try {
    const scale = CARD_WIDTH / target.scrollWidth;
    const dataUrl = await toPng(target, {
      quality: 1,
      pixelRatio: Math.max(2, window.devicePixelRatio * scale),
      backgroundColor: bgColor,
      skipFonts: false,
      // Stamp resolved CSS vars onto the clone root so view-scoped overrides apply.
      style: { cssText: cssVarStyle } as Partial<CSSStyleDeclaration>,
      // Skip cross-origin map tiles — they taint the canvas.
      filter: (node) => {
        if (node instanceof HTMLImageElement) {
          try {
            const url = new URL(node.src, location.href);
            if (url.origin !== location.origin && url.protocol !== 'data:') return false;
          } catch { /* keep */ }
        }
        return true;
      },
    });

    const blob = await fetch(dataUrl).then((r) => r.blob());
    return { dataUrl, blob };
  } finally {
    setDisplay(toCollapse, false);
    setVisibility(toHide, false);
    target.style.overflow = '';
  }
}

export async function downloadSnapshot(blob: Blob, filename = 'marginalia-profile.png'): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function shareSnapshot(blob: Blob, title = 'My Reading Profile'): Promise<boolean> {
  if (!navigator.canShare?.({ files: [new File([blob], 'profile.png', { type: 'image/png' })] })) {
    return false;
  }
  try {
    await navigator.share({
      title,
      files: [new File([blob], 'marginalia-profile.png', { type: 'image/png' })],
    });
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return true;
    logError(err instanceof Error ? err : new Error(String(err)), { context: 'shareSnapshot' });
    return false;
  }
}
