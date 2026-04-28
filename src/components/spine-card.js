/* ==========================================================================
   Marginalia · SpineCard component
   --------------------------------------------------------------------------
   Shared factory for book spine buttons used in Shelf and Booklist.
   Returns a <button> element; caller appends it and supplies onClick.

   createSpineCard(config) → HTMLButtonElement
   config {
     title       string  — display title (already truncated or raw)
     author      string  — display author
     spine       string  — CSS color for background
     text        string  — CSS color for text
     width       number  — px
     height      number  — px
     className   string  — base class ('shelf-spine' | 'booklist-spine')
     extraClasses string[] — optional extra class names
     dataAttrs   object  — key/value pairs for dataset
     ariaLabel   string  — optional aria-label override
     titleClass  string  — class for title span
     authorClass string  — class for author span
     onClick     fn(buttonEl) — click callback
   }
   ========================================================================== */

window.SpineCard = {
  /**
   * @param {object} config
   * @returns {HTMLButtonElement}
   */
  create(config) {
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

    Object.entries(dataAttrs).forEach(([k, v]) => { if (v != null) btn.dataset[k] = v; });

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
