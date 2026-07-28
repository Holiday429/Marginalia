/* ==========================================================================
   Marginalia · Characters panel (fiction)
   ========================================================================== */

import { PanelRegistry } from './registry.ts';

const ROLE_ORDER = ['protagonist', 'antagonist', 'supporting', 'minor'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}

function renderCharacters(book, container) {
  const data = book?._aiData?.['character-map'];
  if (!Array.isArray(data) || data.length === 0) {
    container.innerHTML = `<div class="panel-empty">
      <p class="panel-empty__label">Character map not yet generated.</p>
    </div>`;
    return;
  }

  const sorted = [...data].sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.role);
    const bi = ROLE_ORDER.indexOf(b.role);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const cardsHtml = sorted.map(char => `
    <article class="character-card" data-role="${esc(char.role || '')}">
      <header class="character-card__header">
        <h3 class="character-card__name">${esc(char.name)}</h3>
        ${char.role ? `<span class="character-card__role">${esc(char.role)}</span>` : ''}
      </header>
      ${char.description ? `<p class="character-card__description">${esc(char.description)}</p>` : ''}
      ${char.traits?.length ? `
        <div class="character-card__traits">
          ${char.traits.map(t => `<span class="character-trait">${esc(t)}</span>`).join('')}
        </div>
      ` : ''}
      ${char.arc ? `<p class="character-card__arc"><em>Arc:</em> ${esc(char.arc)}</p>` : ''}
      ${char.relationships?.length ? `
        <div class="character-card__rels">
          ${char.relationships.map(r => `
            <span class="character-rel">${esc(r.with)} <em>${esc(r.type)}</em></span>
          `).join('')}
        </div>
      ` : ''}
      ${char.keyMoment ? `<p class="character-card__moment">${esc(char.keyMoment)}</p>` : ''}
    </article>
  `).join('');

  container.innerHTML = `<div class="character-cards-grid">${cardsHtml}</div>`;
}

PanelRegistry.set('characters', renderCharacters);

export { renderCharacters };
