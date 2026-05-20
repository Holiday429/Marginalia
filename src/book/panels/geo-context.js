/* ==========================================================================
   Marginalia · Geo-Context panel (travel)
   ========================================================================== */

import { PanelRegistry } from './registry.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}

function renderGeoContext(book, container) {
  const data = book?._aiData?.['geo-context'];
  if (!Array.isArray(data) || data.length === 0) {
    container.innerHTML = `<div class="panel-empty">
      <p class="panel-empty__label">Geographic context not yet generated.</p>
    </div>`;
    return;
  }

  const cardsHtml = data.map(place => `
    <article class="geo-card">
      <header class="geo-card__header">
        <h3 class="geo-card__place">${esc(place.place)}</h3>
        ${place.country ? `<span class="geo-card__country">${esc(place.country)}</span>` : ''}
      </header>
      ${place.historicalPeriod ? `<p class="geo-card__period">${esc(place.historicalPeriod)}</p>` : ''}
      ${place.culturalContext ? `<p class="geo-card__context">${esc(place.culturalContext)}</p>` : ''}
      ${place.readingNote ? `
        <div class="geo-card__note">
          <span class="geo-card__note-label">Reading note</span>
          <p>${esc(place.readingNote)}</p>
        </div>
      ` : ''}
    </article>
  `).join('');

  container.innerHTML = `<div class="geo-context-panel"><div class="geo-cards-list">${cardsHtml}</div></div>`;
}

PanelRegistry.set('geo-context', renderGeoContext);

export { renderGeoContext };
