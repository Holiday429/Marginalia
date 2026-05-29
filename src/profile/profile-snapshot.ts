import { toPng } from 'html-to-image';
import QRCode from 'qrcode';
import { logError } from '../services/analytics.ts';

export interface SnapshotResult {
  dataUrl: string;
  blob: Blob;
}

export interface SnapshotOptions {
  /** URL encoded into the footer QR code; falls back to the current location. */
  shareUrl?: string;
}

const CARD_WIDTH = 1200;
const SITE_TAGLINE = 'Marginalia — where reading becomes memory. Track what you read, map where it took you, and turn insight into action.';

/**
 * Elements fully removed from layout during capture (collapse, no trailing
 * whitespace). The CTA lives here so the image ends right after the shelf.
 */
const COLLAPSE_SELECTORS = [
  '.prof-share-cta',
  '.panel-header',
  '.primary-tabs',
  '.booklist-source',   // "Shelf spread" — card ends at the ranked annual shelf
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

// Radar geometry — must match RADAR_* constants in reading-identity.ts.
const RADAR_SIZE = 240;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = 84;

/**
 * Force the identity radar polygon to its final (scored) shape so the export
 * never captures a mid-animation or collapsed (black point) state.
 */
function settleRadar(target: HTMLElement): void {
  const radar = target.querySelector<HTMLElement>('.prof-rid-radar');
  const shape = target.querySelector<SVGPolygonElement>('.prof-rid-radar__shape');
  if (!radar || !shape) return;
  let scores: number[] = [];
  try { scores = JSON.parse(radar.dataset.axes || '[]') as number[]; } catch { return; }
  if (!scores.length) return;
  const dots = Array.from(target.querySelectorAll<SVGCircleElement>('.prof-rid-radar__dot'));
  const pts = scores.map((s, i) => {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / scores.length;
    const r = RADAR_RADIUS * (Math.max(0, Math.min(100, s)) / 100);
    const x = RADAR_CENTER + Math.cos(angle) * r;
    const y = RADAR_CENTER + Math.sin(angle) * r;
    const dot = dots[i];
    if (dot) { dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1)); }
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  shape.setAttribute('points', pts);
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

/**
 * Build the closing CTA footer: a one-line intro to Marginalia plus a QR code
 * that opens the site / this profile. Appended to the capture target so it
 * appears at the bottom of the exported card.
 */
async function buildFooter(shareUrl: string, vars: { ink: string; muted: string; gold: string; border: string }): Promise<HTMLElement> {
  const footer = document.createElement('div');
  footer.dataset.snapshotFooter = 'true';
  // No top margin: the .prof-shell__inner flex gap already spaces it from the
  // shelf above.
  footer.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:28px',
    'padding:28px 4px 8px',
    `border-top:1px solid ${vars.border}`,
    'font-family:Fraunces, Georgia, serif',
  ].join(';');

  const text = document.createElement('div');
  text.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:8px;';
  const wordmark = document.createElement('div');
  wordmark.textContent = 'Marginalia';
  wordmark.style.cssText = `font-family:'Bodoni Moda', Georgia, serif;font-size:26px;letter-spacing:0.01em;color:${vars.gold};`;
  const tagline = document.createElement('p');
  tagline.textContent = SITE_TAGLINE.replace(/^Marginalia — /, '');
  tagline.style.cssText = `margin:0;font-size:15px;line-height:1.5;color:${vars.muted};max-width:640px;`;
  const scanHint = document.createElement('p');
  scanHint.textContent = 'Scan to open →';
  scanHint.style.cssText = `margin:0;font-family:'IBM Plex Mono', monospace;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${vars.muted};opacity:0.7;`;
  text.append(wordmark, tagline, scanHint);

  const qrWrap = document.createElement('div');
  qrWrap.style.cssText = 'flex-shrink:0;padding:10px;background:#f4ecd8;border-radius:8px;';
  try {
    const qrDataUrl = await QRCode.toDataURL(shareUrl, {
      width: 132,
      margin: 0,
      color: { dark: '#2b2620', light: '#f4ecd8' },
    });
    const qrImg = document.createElement('img');
    qrImg.src = qrDataUrl;
    qrImg.width = 112;
    qrImg.height = 112;
    qrImg.alt = 'Scan to open Marginalia';
    qrImg.style.cssText = 'display:block;width:112px;height:112px;';
    qrWrap.appendChild(qrImg);
  } catch {
    qrWrap.remove();
  }

  footer.append(text);
  if (qrWrap.childElementCount) footer.append(qrWrap);
  return footer;
}

export async function captureProfileSnapshot(
  container: HTMLElement,
  options: SnapshotOptions = {},
): Promise<SnapshotResult> {
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
  settleRadar(target);
  target.style.overflow = 'visible';

  // Resolved bg colour for the canvas fill (avoids transparent / wrong-colour gaps).
  const bgColor = resolveVar(target, '--bg-tool', '#302e2a');
  const cssVarStyle = buildCssVarOverrides(target);

  // Add comfortable side margins matching the site's reading width, and a
  // closing CTA footer with the QR code.
  const prevPadding = target.style.padding;
  target.style.padding = '40px 56px 8px';
  const footer = await buildFooter(options.shareUrl || window.location.href, {
    ink: resolveVar(target, '--ink', '#ede0c8'),
    muted: resolveVar(target, '--muted', 'rgba(237,224,200,0.78)'),
    gold: resolveVar(target, '--gold', '#c49a52'),
    border: resolveVar(target, '--rule', 'rgba(232,224,200,0.16)'),
  });
  target.appendChild(footer);

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
    footer.remove();
    target.style.padding = prevPadding;
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
