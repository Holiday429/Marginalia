/* ==========================================================================
   Marginalia · Laptop fly-in transition
   CSS-only: the MacBook screen expands from its projected viewport position
   to fill the screen, then hands off to the flat Search view. No new WebGL
   renderer needed — the room canvas stays visible behind the clip-path mask
   until the overlay covers everything.

   Lazy-loaded; degrades to an immediate resolve on any failure so navigation
   never blocks.
   ========================================================================== */

/**
 * Play the fly-in. Returns a Promise that resolves when the animation has
 * finished and the overlay has been cleaned up. Never rejects.
 *
 * @param {object} [opts]
 * @param {number} [opts.duration=600] total animation time in ms
 * @param {() => void} [opts.onLanded] fired at 80% of duration while the
 *   screen fill covers everything — the caller should navigate here so the
 *   destination paints BEHIND the overlay before it is removed (no flash).
 * @param {{ x: number, y: number, w: number, h: number }} [opts.macbookScreenRect]
 *   Fractional viewport coordinates of the MacBook screen. Defaults to an
 *   approximate centre-screen position if not provided.
 */
export function playLaptopFlyIn(opts = {}) {
  const duration = opts.duration ?? 600;
  const onLanded = typeof opts.onLanded === 'function' ? opts.onLanded : null;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'laptop-fly-overlay';
    document.body.appendChild(overlay);

    // Approximate macbook screen position in the viewport (overridden by opts if provided)
    const rect = opts.macbookScreenRect ?? { x: 0.44, y: 0.52, w: 0.14, h: 0.09 };
    const top    = (rect.y * 100).toFixed(1);
    const right  = ((1 - rect.x - rect.w) * 100).toFixed(1);
    const bottom = ((1 - rect.y - rect.h) * 100).toFixed(1);
    const left   = (rect.x * 100).toFixed(1);

    overlay.style.clipPath = `inset(${top}% ${right}% ${bottom}% ${left}% round 4px)`;

    // Force reflow before animating
    overlay.getBoundingClientRect();

    overlay.style.transition = `clip-path ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    overlay.style.clipPath = 'inset(0% 0% 0% 0% round 0px)';

    const landedAt = duration * 0.8;
    let landed = false;

    setTimeout(() => {
      if (!landed) { landed = true; onLanded?.(); }
    }, landedAt);

    setTimeout(() => {
      if (!landed) { landed = true; onLanded?.(); }
      overlay.remove();
      resolve();
    }, duration + 100);
  });
}
