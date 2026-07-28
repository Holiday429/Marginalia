/* ==========================================================================
   Marginalia · Timeline panel
   --------------------------------------------------------------------------
   Two supported input shapes:
   1. Era-grouped (nonfiction, from existing `timeline-gen` prompt):
        [{ era, items: [{ year, title, tags }] }]
   2. Beat list (fiction, from a future variant):
        [{ chapter, period, event, characters[], significance, highlight }]
   ========================================================================== */

import { PanelRegistry } from './registry.ts';

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}

function isEraGrouped(items) {
  return items.length > 0 && Array.isArray(items[0]?.items);
}

function renderEraGrouped(groups) {
  return groups.map(group => `
    <div class="mindmap-era">
      <h4 class="mindmap-era__label">${esc(group.era || '')}</h4>
      <ul class="mindmap-era__items">
        ${(group.items || []).map(item => `
          <li class="mindmap-timeline-item">
            <span class="mindmap-timeline-item__year">${esc(item.year || '')}</span>
            <span class="mindmap-timeline-item__title">${esc(item.title || '')}</span>
            ${(item.tags || []).map(t => `<span class="mindmap-tag">${esc(t)}</span>`).join('')}
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('');
}

function renderBeats(items) {
  const beatsHtml = items.map((item, i) => `
    <div class="timeline-item">
      <div class="timeline-item__marker">
        <span class="timeline-item__num">${i + 1}</span>
      </div>
      <div class="timeline-item__body">
        <div class="timeline-item__meta">
          ${item.chapter ? `<span class="timeline-item__chapter">${esc(item.chapter)}</span>` : ''}
          ${item.period  ? `<span class="timeline-item__period">${esc(item.period)}</span>` : ''}
        </div>
        ${item.event ? `<p class="timeline-item__event">${esc(item.event)}</p>` : ''}
        ${item.highlight ? `<blockquote class="timeline-item__quote">${esc(item.highlight)}</blockquote>` : ''}
        ${item.characters?.length ? `<p class="timeline-item__characters">${item.characters.map(esc).join(', ')}</p>` : ''}
        ${item.significance ? `<p class="timeline-item__significance">${esc(item.significance)}</p>` : ''}
      </div>
    </div>
  `).join('');
  return `<div class="timeline-track">${beatsHtml}</div>`;
}

function renderTimeline(book, container) {
  const data = book?._aiData?.['timeline-gen'] || book?.mindmap?.timeline;
  if (!Array.isArray(data) || data.length === 0) {
    container.innerHTML = `<div class="panel-empty">
      <p class="panel-empty__label">Timeline not yet generated.</p>
    </div>`;
    return;
  }

  const inner = isEraGrouped(data) ? renderEraGrouped(data) : renderBeats(data);
  container.innerHTML = `<div class="timeline-panel">${inner}</div>`;
}

PanelRegistry.set('timeline', renderTimeline);

export { renderTimeline };
