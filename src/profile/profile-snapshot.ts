import { toPng } from 'html-to-image';
import { logError } from '../services/analytics.ts';

export interface SnapshotResult {
  dataUrl: string;
  blob: Blob;
}

const CARD_WIDTH = 1200;

/** Hide elements that shouldn't appear in the exported image. */
const EXCLUDE_SELECTORS = [
  '.prof-share-cta',
  '.prof-map-zoom',
  '.prof-map-pills',
  '.prof-map-play-btn',
  '.prof-map-rail',
  '.prof-rid-btn--ghost',          // Re-divine button
  '.booklist-play-btn',
  '.booklist-section-head--source',
  '.prof-annual__shelf-controls',
  '.panel-header',
  '.primary-tabs',
];

function setVisibility(els: HTMLElement[], hidden: boolean): void {
  els.forEach((el) => { el.style.visibility = hidden ? 'hidden' : ''; });
}

export async function captureProfileSnapshot(container: HTMLElement): Promise<SnapshotResult> {
  const target = container.querySelector<HTMLElement>('.prof-shell__inner');
  if (!target) throw new Error('Profile content area not found.');

  // Collect elements to temporarily hide.
  const toHide = EXCLUDE_SELECTORS.flatMap((sel) =>
    Array.from(target.querySelectorAll<HTMLElement>(sel)),
  );
  setVisibility(toHide, true);

  // Scroll container into view so nothing is clipped by viewport.
  target.style.overflow = 'visible';

  try {
    const scale = CARD_WIDTH / target.scrollWidth;
    const dataUrl = await toPng(target, {
      quality: 1,
      pixelRatio: Math.max(2, window.devicePixelRatio * scale),
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#1a1510',
      skipFonts: false,
      // Don't embed cross-origin map tiles — they'll draw blank, which is fine.
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
