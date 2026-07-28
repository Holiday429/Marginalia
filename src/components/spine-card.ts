/* ==========================================================================
   Marginalia · SpineCard component
   --------------------------------------------------------------------------
   Shared factory for book spine buttons used in Shelf and Booklist.
   Returns a <button> element; caller appends it and supplies onClick.
   ========================================================================== */

export interface SpineCardConfig {
  title?: string;
  author?: string;
  spine?: string;
  text?: string;
  width?: number;
  height?: number;
  className?: string;
  extraClasses?: string[];
  dataAttrs?: Record<string, string | number | boolean | null | undefined>;
  ariaLabel?: string;
  titleClass?: string;
  authorClass?: string;
  onClick?: (buttonEl: HTMLButtonElement) => void;
}

export const SpineCard = {
  create(config: SpineCardConfig): HTMLButtonElement {
    const {
      title       = '',
      author      = '',
      spine       = '#2b2b2b',
      text        = '#e8dfc8',
      width,
      height,
      className   = 'spine-card',
      extraClasses = [],
      dataAttrs   = {},
      ariaLabel,
      titleClass,
      authorClass,
      onClick,
    } = config;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = [className, ...extraClasses].filter(Boolean).join(' ');

    Object.entries(dataAttrs).forEach(([k, v]) => { if (v != null) btn.dataset[k] = String(v); });

    if (width  != null) btn.style.width  = width  + 'px';
    if (height != null) btn.style.height = height + 'px';
    btn.style.background = spine;
    btn.style.color      = text;

    if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);

    const titleEl = document.createElement('span');
    titleEl.className = titleClass || `${className}-title`;
    titleEl.textContent = title;
    btn.appendChild(titleEl);

    const authorEl = document.createElement('span');
    authorEl.className = authorClass || `${className}-author`;
    authorEl.textContent = author;
    btn.appendChild(authorEl);

    if (typeof onClick === 'function') {
      btn.addEventListener('click', () => onClick(btn));
    }

    return btn;
  },
};
