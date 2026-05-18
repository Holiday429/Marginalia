/**
 * Reading Identity — AI-generated reader portrait.
 *
 * Flow: a closed book sits on the desk surface → clicking "Generate" opens the
 * cover → a postcard slides out → the section resolves into the identity card
 * and behavior notes.
 *
 * The UI renders against mock data for now, but uses the same schema that the
 * long-term AI result will return.
 */
import { cycleReadingIdentityVariant } from './reading-identity-adapter.ts';
import { READING_IDENTITY_MOCK } from './reading-identity-mock.ts';
import { getReadingIdentityResult } from './reading-identity-service.ts';
import type {
  ReadingIdentityAxis,
  ReadingIdentityBehaviorEntry,
  ReadingIdentityResult,
} from './reading-identity-types.ts';

const TYPE_SPEED_MS = 18;
const REGEN_SWAP_MS = 700;
const AXIS_STAGGER_MS = 120;
const COVER_OPEN_MS = 620;
const CARD_SLIDE_MS = 760;
const GENERATE_PRELUDE_MS = 520;
const CARD_PRINT_MS = 1100;
const NOTE_ROTATIONS = [-2.8, 1.6, -1.2, 2.2, -0.9, 1.4];

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bookSceneHTML(data: ReadingIdentityResult): string {
  return `
    <div class="prof-rid-book" aria-hidden="true">
      <div class="prof-rid-book__shadow"></div>
      <div class="prof-rid-book__solid">
        <span class="prof-rid-book__pages"></span>
        <span class="prof-rid-book__cover">
          <span class="prof-rid-book__cover-kicker">Marginalia</span>
          <span class="prof-rid-book__cover-title">Reading\nIdentity</span>
          <span class="prof-rid-book__cover-year">${escapeHtml(data.yearScope)}</span>
        </span>
      </div>
    </div>
  `;
}

function ctaStateHTML(data: ReadingIdentityResult): string {
  return `
    <section class="prof-rid-stage prof-rid-stage--cta" aria-label="Reading Identity">
      ${bookSceneHTML(data)}
      <div class="prof-rid-cta">
        <p class="prof-rid-cta__title">Your reading identity, as seen by an outside eye</p>
        <p class="prof-rid-cta__hint">Marginalia reads your library and margin notes, then writes a short portrait of how you read — what draws you, what you avoid, what the pattern reveals.</p>
        <button class="prof-rid-btn prof-rid-btn--primary" id="profRidGenerate" type="button">
          Generate
        </button>
      </div>
    </section>
  `;
}

function axisRowHTML(axis: ReadingIdentityAxis, idx: number): string {
  return `
    <div class="prof-rid-axis" data-idx="${idx}" data-value="${axis.score}">
      <div class="prof-rid-axis__head">
        <span class="prof-rid-axis__label">${escapeHtml(axis.label)}</span>
        <span class="prof-rid-axis__pct">0%</span>
        <span class="prof-rid-axis__pair">↔ ${escapeHtml(axis.opposite)}</span>
      </div>
      <div class="prof-rid-axis__track">
        <div class="prof-rid-axis__fill"></div>
        <div class="prof-rid-axis__tick"></div>
      </div>
    </div>
  `;
}

function postcardHTML(
  data: ReadingIdentityResult,
  mode: 'result' | 'developing' = 'result',
  options: { allowRegenerate?: boolean } = {},
): string {
  const modeClass = mode === 'developing' ? ' prof-rid-postcard--developing' : '';
  return `
    <section class="prof-rid-postcard${modeClass}" aria-label="Reading Identity artifact">
      <span class="prof-rid-postcard__scan" aria-hidden="true"></span>
      <div class="prof-rid-stamp" aria-hidden="true">
        <span class="prof-rid-stamp__monogram">m</span>
        <span class="prof-rid-stamp__word">Marginalia</span>
        <span class="prof-rid-stamp__year">${escapeHtml(data.yearScope)}</span>
      </div>

      <div class="prof-rid-postcard__kicker">
        <span class="prof-rid-postcard__kicker-text">Reading Identity · ${escapeHtml(data.yearScope)}</span>
        <span class="prof-rid-postcard__kicker-rule"></span>
      </div>

      <div class="prof-rid-postcard__name">
        <h1 class="prof-rid-postcard__archetype">${escapeHtml(data.archetype.title)}</h1>
        ${data.archetype.titleZh ? `<span class="prof-rid-postcard__archetype-cn">「${escapeHtml(data.archetype.titleZh)}」</span>` : ''}
      </div>

      <p class="prof-rid-postcard__summary">
        <span class="prof-rid-postcard__summary-text">${escapeHtml(data.archetype.summary)}</span>
      </p>
      ${data.archetype.summaryZh ? `<p class="prof-rid-postcard__summary-zh">${escapeHtml(data.archetype.summaryZh)}</p>` : ''}

      <div class="prof-rid-postcard__axes">
        ${data.axes.map((axis, i) => axisRowHTML(axis, i)).join('')}
      </div>

      <div class="prof-rid-postcard__footer">
        <div class="prof-rid-postcard__meta">
          <span>Filed ${escapeHtml(data.generatedAt)}</span>
        </div>
        ${options.allowRegenerate === false ? '' : `
          <div class="prof-rid-postcard__actions">
            <button class="prof-rid-btn prof-rid-btn--ghost" id="profRidRegen" type="button">
              <svg class="prof-rid-regen-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 12a9 9 0 0 1 15.5-6.3L21 3v6h-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M21 12a9 9 0 0 1-15.5 6.3L3 21v-6h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="prof-rid-btn__label">Re-divine</span>
            </button>
          </div>
        `}
      </div>
    </section>
  `;
}

function sectionHeaderHTML(title: string): string {
  return `
    <div class="prof-rid-shead">
      <h2 class="prof-rid-shead__title">${escapeHtml(title)}</h2>
    </div>
  `;
}

function behaviorNoteHTML(entry: ReadingIdentityBehaviorEntry, idx: number): string {
  return `
    <article class="prof-rid-note prof-rid-note--trait" data-tone="${idx % 3}" style="--note-rot:${NOTE_ROTATIONS[idx % NOTE_ROTATIONS.length]}deg; --note-delay:${120 + idx * 110}ms;">
      <span class="prof-rid-note__pin" aria-hidden="true"></span>
      <span class="prof-rid-note__kicker">${escapeHtml(entry.label)}</span>
      <p class="prof-rid-note__value">${escapeHtml(entry.value)}</p>
      <p class="prof-rid-note__detail">${escapeHtml(entry.rationale)}</p>
      ${entry.signal ? `<p class="prof-rid-note__signal">${escapeHtml(entry.signal)}</p>` : ''}
    </article>
  `;
}

function behaviorPanelHTML(data: ReadingIdentityResult): string {
  return `
    <section class="prof-rid-section" aria-label="How you read">
      ${sectionHeaderHTML('How You Read')}
      <div class="prof-rid-notes prof-rid-notes--traits">
        ${data.behaviorProfile.map((entry, i) => behaviorNoteHTML(entry, i)).join('')}
      </div>
    </section>
  `;
}

function animateAxes(host: HTMLElement, fromZero: boolean): void {
  const rows = host.querySelectorAll<HTMLElement>('.prof-rid-axis');
  rows.forEach((row, i) => {
    const value = Number(row.dataset.value || 0);
    const fill = row.querySelector<HTMLElement>('.prof-rid-axis__fill');
    const tick = row.querySelector<HTMLElement>('.prof-rid-axis__tick');
    const pct = row.querySelector<HTMLElement>('.prof-rid-axis__pct');
    const apply = () => {
      if (fill) fill.style.width = `${value}%`;
      if (tick) tick.style.left = `${value}%`;
      if (pct) pct.textContent = `${value}%`;
    };
    if (fromZero) {
      if (fill) fill.style.width = '0%';
      if (tick) tick.style.left = '0%';
      window.setTimeout(apply, 200 + i * AXIS_STAGGER_MS);
    } else {
      window.setTimeout(apply, i * AXIS_STAGGER_MS);
    }
  });
}

function typewrite(el: HTMLElement, text: string, onDone?: () => void): number {
  el.textContent = '';
  let i = 0;
  const timer = window.setInterval(() => {
    i += 1;
    el.textContent = text.slice(0, i);
    if (i >= text.length) {
      window.clearInterval(timer);
      onDone?.();
    }
  }, TYPE_SPEED_MS);
  return timer;
}

function bindResult(host: HTMLElement, initialData: ReadingIdentityResult): void {
  let currentData = initialData;
  let variantIndex = 0;
  let regenerating = false;
  let typeTimer = 0;

  const regenBtn = host.querySelector<HTMLButtonElement>('#profRidRegen');
  const regenLabel = regenBtn?.querySelector<HTMLElement>('.prof-rid-btn__label');
  const regenIcon = regenBtn?.querySelector<HTMLElement>('.prof-rid-regen-icon');

  regenBtn?.addEventListener('click', () => {
    if (regenerating) return;
    regenerating = true;
    if (regenLabel) regenLabel.textContent = 'Re-divining…';
    regenIcon?.classList.add('is-spinning');

    const next = cycleReadingIdentityVariant(currentData, variantIndex);
    currentData = next.result;
    variantIndex = next.variantIndex;

    const rows = host.querySelectorAll<HTMLElement>('.prof-rid-axis');
    rows.forEach((row, i) => { row.dataset.value = String(currentData.axes[i]?.score ?? 0); });
    animateAxes(host, true);

    const archetypeEl = host.querySelector<HTMLElement>('.prof-rid-postcard__archetype');
    const archetypeCnEl = host.querySelector<HTMLElement>('.prof-rid-postcard__archetype-cn');
    const summaryEl = host.querySelector<HTMLElement>('.prof-rid-postcard__summary');
    const summaryTextEl = host.querySelector<HTMLElement>('.prof-rid-postcard__summary-text');
    const summaryZhEl = host.querySelector<HTMLElement>('.prof-rid-postcard__summary-zh');
    if (summaryEl) summaryEl.classList.add('is-typing');
    if (summaryTextEl) summaryTextEl.textContent = '';

    window.clearInterval(typeTimer);
    window.setTimeout(() => {
      if (archetypeEl) archetypeEl.textContent = currentData.archetype.title;
      if (archetypeCnEl) {
        if (currentData.archetype.titleZh) archetypeCnEl.textContent = `「${currentData.archetype.titleZh}」`;
        else archetypeCnEl.textContent = '';
      }
      if (summaryZhEl) summaryZhEl.textContent = currentData.archetype.summaryZh ?? '';
      if (summaryTextEl) {
        typeTimer = typewrite(summaryTextEl, currentData.archetype.summary, () => {
          regenerating = false;
          if (regenLabel) regenLabel.textContent = 'Re-divine';
          regenIcon?.classList.remove('is-spinning');
          if (summaryEl) summaryEl.classList.remove('is-typing');
        });
      }
    }, REGEN_SWAP_MS);
  });
}

function resultHTML(data: ReadingIdentityResult, options: { allowRegenerate?: boolean } = {}): string {
  return `
    <div class="prof-rid">
      <div class="prof-rid-layout">
        <div class="prof-rid-layout__card">
          ${postcardHTML(data, 'result', options)}
        </div>
        <div class="prof-rid-layout__behavior">
          ${behaviorPanelHTML(data)}
        </div>
      </div>
    </div>
  `;
}

function renderResult(host: HTMLElement, data: ReadingIdentityResult, options: { allowRegenerate?: boolean } = {}): void {
  host.innerHTML = resultHTML(data, options);
  const root = host.querySelector<HTMLElement>('.prof-rid');
  if (root) {
    root.classList.add('is-entering');
    requestAnimationFrame(() => root.classList.add('is-entered'));
    window.setTimeout(() => root.classList.remove('is-entering'), 720);
  }
  bindResult(host, data);
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      animateAxes(host, true);
      observer.disconnect();
    });
  }, { threshold: 0.3 });
  const postcard = host.querySelector<HTMLElement>('.prof-rid-postcard');
  if (postcard) observer.observe(postcard);
}

function runReveal(host: HTMLElement, data: ReadingIdentityResult): void {
  const stage = host.querySelector<HTMLElement>('.prof-rid-stage');
  if (!stage) { renderResult(host, data); return; }

  const generateBtn = host.querySelector<HTMLButtonElement>('#profRidGenerate');
  if (generateBtn?.disabled) return;

  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generate';
  }
  stage.classList.add('is-generating');

  window.setTimeout(() => {
    host.querySelector<HTMLElement>('.prof-rid-cta')?.classList.add('is-leaving');
    stage.classList.add('is-revealing');

    const sliding = document.createElement('div');
    sliding.className = 'prof-rid-stage__slide';
    sliding.innerHTML = postcardHTML(data, 'developing');
    stage.appendChild(sliding);

    requestAnimationFrame(() => stage.classList.add('is-open'));
    window.setTimeout(() => sliding.classList.add('is-out'), COVER_OPEN_MS * 0.55);
    window.setTimeout(() => sliding.classList.add('is-printing'), COVER_OPEN_MS * 0.55 + CARD_SLIDE_MS - 80);

    window.setTimeout(() => {
      renderResult(host, data);
    }, COVER_OPEN_MS * 0.55 + CARD_SLIDE_MS + CARD_PRINT_MS - 80);
  }, GENERATE_PRELUDE_MS);
}

export function mountReadingIdentity(
  host: HTMLElement,
  data: ReadingIdentityResult = READING_IDENTITY_MOCK,
  options: { revealImmediately?: boolean } = {},
): void {
  const currentData = getReadingIdentityResult(data);
  if (options.revealImmediately) {
    renderResult(host, currentData, { allowRegenerate: false });
    return;
  }
  host.innerHTML = `<div class="prof-rid prof-rid--gate">${ctaStateHTML(currentData)}</div>`;
  host.querySelector<HTMLButtonElement>('#profRidGenerate')?.addEventListener('click', () => {
    runReveal(host, currentData);
  });
}
