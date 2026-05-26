/* ==========================================================================
   Marginalia · Book detail fly-in transition
   CSS-only: the real cover image card expands from the desk book's projected
   screen position to fill the viewport, then hands off to the Book panel.
   No WebGL — uses the cover the user already sees on the desk, so there is
   no discontinuity between the 3D object and the transition.

   Mirrors the library spine→cover expand mechanic: same object, bigger stage.
   Degrades gracefully if coverUrl or coverRect are unavailable.
   ========================================================================== */

/**
 * @param {object} [opts]
 * @param {number}  [opts.duration=600]   total expand time in ms
 * @param {() => void} [opts.onLanded]    fired at 80% through, while overlay still covers screen
 * @param {string|null} [opts.coverUrl]   cover image URL (matches what the desk book shows)
 * @param {{left:number,top:number,width:number,height:number}|null} [opts.coverRect]
 *   projected CSS-pixel rect of the desk book in the room canvas — anchors the card
 */
export function playBookFlyIn(opts = {}) {
  const duration = opts.duration ?? 600;
  const onLanded = typeof opts.onLanded === 'function' ? opts.onLanded : null;
  const coverUrl = opts.coverUrl ?? null;
  const coverRect = opts.coverRect ?? null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    // --- Build overlay scrim ---
    const scrim = document.createElement('div');
    scrim.className = 'book-fly-overlay';
    document.body.appendChild(scrim);

    // --- Build cover card ---
    // Starts at the desk book's screen rect and expands to fill the viewport.
    const card = document.createElement('div');
    card.className = 'book-fly-card';

    if (coverUrl) {
      const img = document.createElement('img');
      img.src = coverUrl;
      img.alt = '';
      img.className = 'book-fly-card__img';
      card.appendChild(img);
    }

    // Solid fallback colour while image loads (or if no URL)
    card.style.setProperty('--book-fly-bg', '#14263e');

    // Position card at the desk book's projected rect. If we don't have one,
    // fall back to a small rect near the bottom-centre of the screen.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const src = coverRect ?? {
      left: vw * 0.44,
      top: vh * 0.60,
      width: vw * 0.06,
      height: vh * 0.10,
    };

    // Start: card at source rect
    card.style.position = 'fixed';
    card.style.left = `${src.left}px`;
    card.style.top = `${src.top}px`;
    card.style.width = `${src.width}px`;
    card.style.height = `${src.height}px`;
    card.style.borderRadius = '3px';
    card.style.overflow = 'hidden';
    card.style.zIndex = '10000';
    card.style.willChange = 'left, top, width, height, border-radius';
    document.body.appendChild(card);

    // Force reflow so starting position is painted before we set the transition
    card.getBoundingClientRect();

    // Activate scrim
    requestAnimationFrame(() => {
      scrim.classList.add('is-active');
    });

    // Animate card to fill viewport
    card.style.transition = [
      `left ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      `top ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      `width ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      `height ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      `border-radius ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
    ].join(', ');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.style.left = '0px';
        card.style.top = '0px';
        card.style.width = `${vw}px`;
        card.style.height = `${vh}px`;
        card.style.borderRadius = '0px';
      });
    });

    // Fire onLanded at 80% so the panel renders behind the card
    const landedTimer = setTimeout(() => {
      onLanded?.();
    }, duration * 0.8);

    // Tear down after animation completes
    setTimeout(() => {
      clearTimeout(landedTimer);
      onLanded?.();   // safety net
      // Fade both card and scrim out so the Book panel is revealed
      card.style.transition = 'opacity 0.38s ease';
      scrim.style.transition = 'opacity 0.38s ease';
      card.style.opacity = '0';
      scrim.style.opacity = '0';
      setTimeout(() => {
        card.remove();
        scrim.remove();
        finish();
      }, 400);
    }, duration + 50);
  });
}
