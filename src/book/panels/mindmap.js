/* ==========================================================================
   Marginalia · Mindmap panel
   --------------------------------------------------------------------------
   Renders the knowledge-structure data shipped with a book (seed) or
   produced by the `mindmap-gen` AI feature.

   Data shape: book._aiData?.['mindmap-gen'] || book.mindmap
   { title, subtitle, timeline[], revolutions[], ideas[], happiness{}, futurePaths[] }
   ========================================================================== */

import { PanelRegistry } from './registry.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}

function renderMindmap(book, container) {
  const data = book?._aiData?.['mindmap-gen'] || book?.mindmap;
  if (!data) {
    container.innerHTML = `<div class="panel-empty">
      <p class="panel-empty__label">Knowledge structure not yet generated.</p>
    </div>`;
    return;
  }

  const timelineHtml = (data.timeline || []).map(group => `
    <div class="mindmap-era">
      <h4 class="mindmap-era__label">${esc(group.era)}</h4>
      <ul class="mindmap-era__items">
        ${(group.items || []).map(item => `
          <li class="mindmap-timeline-item">
            <span class="mindmap-timeline-item__year">${esc(item.year)}</span>
            <span class="mindmap-timeline-item__title">${esc(item.title)}</span>
            ${(item.tags || []).map(t => `<span class="mindmap-tag">${esc(t)}</span>`).join('')}
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('');

  const revolutionsHtml = (data.revolutions || []).map(rev => `
    <div class="mindmap-revolution">
      <div class="mindmap-revolution__header">
        <h3 class="mindmap-revolution__title">${esc(rev.title)}</h3>
        <span class="mindmap-revolution__period">${esc(rev.period)}</span>
      </div>
      ${rev.thesis ? `<p class="mindmap-revolution__thesis">${esc(rev.thesis)}</p>` : ''}
      ${(rev.points || []).length ? `
        <ul class="mindmap-revolution__points">
          ${rev.points.map(p => `<li>${esc(p)}</li>`).join('')}
        </ul>
      ` : ''}
    </div>
  `).join('');

  const ideasHtml = (data.ideas || []).map(idea => `
    <div class="mindmap-idea-card">
      <h4 class="mindmap-idea-card__title">${esc(idea.title)}</h4>
      <p class="mindmap-idea-card__body">${esc(idea.body)}</p>
    </div>
  `).join('');

  const happiness = data.happiness || {};
  const happinessHtml = happiness.question ? `
    <div class="mindmap-happiness">
      <p class="mindmap-happiness__question">${esc(happiness.question)}</p>
      <div class="mindmap-happiness__views">
        ${(happiness.views || []).map(v => `
          <div class="mindmap-happiness__view">
            <strong>${esc(v.title)}</strong>
            <p>${esc(v.body)}</p>
          </div>
        `).join('')}
      </div>
      ${happiness.verdict ? `<p class="mindmap-happiness__verdict">${esc(happiness.verdict)}</p>` : ''}
    </div>
  ` : '';

  const futureHtml = (data.futurePaths || []).map(fp => `
    <div class="mindmap-future-path">
      <h4 class="mindmap-future-path__title">${esc(fp.title)}</h4>
      ${fp.badge ? `<span class="mindmap-future-path__badge">${esc(fp.badge)}</span>` : ''}
      <ul>${(fp.details || []).map(d => `<li>${esc(d)}</li>`).join('')}</ul>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="mindmap-panel">
      <div class="mindmap-panel__header">
        ${data.title ? `<h2 class="mindmap-panel__title">${esc(data.title)}</h2>` : ''}
        ${data.subtitle ? `<p class="mindmap-panel__subtitle">${esc(data.subtitle)}</p>` : ''}
      </div>

      ${timelineHtml ? `<section class="mindmap-section">
        <h3 class="mindmap-section__heading">Timeline</h3>
        ${timelineHtml}
      </section>` : ''}

      ${revolutionsHtml ? `<section class="mindmap-section">
        <h3 class="mindmap-section__heading">Major Themes</h3>
        ${revolutionsHtml}
      </section>` : ''}

      ${ideasHtml ? `<section class="mindmap-section">
        <h3 class="mindmap-section__heading">Key Ideas</h3>
        <div class="mindmap-ideas-grid">${ideasHtml}</div>
      </section>` : ''}

      ${happinessHtml ? `<section class="mindmap-section">
        <h3 class="mindmap-section__heading">Central Question</h3>
        ${happinessHtml}
      </section>` : ''}

      ${futureHtml ? `<section class="mindmap-section">
        <h3 class="mindmap-section__heading">Implications</h3>
        <div class="mindmap-future-grid">${futureHtml}</div>
      </section>` : ''}
    </div>
  `;
}

PanelRegistry.set('mindmap', renderMindmap);

export { renderMindmap };
