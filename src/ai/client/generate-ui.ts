/* ==========================================================================
   Marginalia · AI Generate UI
   --------------------------------------------------------------------------
   Injects "Generate with AI" toolbars into panels that have a registered
   AI feature. Handles loading state, error display, and AI-label stamping.

   Results are stored as AiBlock<T> in Firestore via AiResultsStore.
   Views render `userEdited ?? original`. Users can inline-edit any output.
   ========================================================================== */

import {
  getAiBlock, saveAiOriginal, saveAiUserEdit, clearAiUserEdit, deleteAiBlock,
} from '../../store/ai-results-store.ts';
import { resolveAiContent } from '../../data/schema/ai-block.ts';
import { PanelRegistry } from '../../book/panels/registry.js';
import { EntitlementsStore } from '../../store/entitlements-store.ts';

const FALLBACK_PROMPT_VERSION = '1';
const AI_MODEL_LABEL = 'deepseek-chat';

export const AIGenerateUI = (window as any).AIGenerateUI = (() => {

  async function mount(book: any, root: HTMLElement) {
    const registry: any = (window as any).AIFeatureRegistry;
    if (!registry || !(window as any).BookTypes) return;

    const features: any[] = registry.forBook(book);
    if (!features.length) return;

    for (const feature of features) {
      const targetSection = findTargetSection(root, feature);
      if (!targetSection) continue;
      if (targetSection.querySelector('.ai-toolbar')) continue;

      const toolbar = buildToolbar(feature, book, targetSection);
      targetSection.prepend(toolbar);

      // Restore previously generated result without calling API
      const saved = await getAiBlock(book.id, feature.id);
      if (saved) {
        injectResult(feature, book, targetSection, resolveAiContent(saved), {
          fromCache: true,
          hasUserEdit: saved.userEdited !== undefined,
          block: saved,
        });
      }
    }
  }

  function findTargetSection(root: HTMLElement, feature: any): Element | null {
    // Map panel ids → book.js section ids (see book-detail.js LEGACY_SECTION_ALIASES).
    const panelToSectionId: Record<string, string> = {
      'mindmap':        'visual-notes',
      'characters':     'visual-notes',
      'timeline':       'visual-notes',
      'concept-cards':  'cultural-context',
      'geo-context':    'cultural-context',
      'actions':        'actions',
    };
    const sectionId = panelToSectionId[feature.panel] || feature.panel;
    return root.querySelector(`.book-section#${CSS.escape(sectionId)}`);
  }

  function buildToolbar(feature: any, book: any, section: Element): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'ai-toolbar';
    const hasUnlimited = EntitlementsStore.hasEntitlement('ai.unlimited');
    const quotaHtml = hasUnlimited
      ? `<span class="ai-quota ai-quota--unlimited">Unlimited</span>`
      : '';
    toolbar.innerHTML = `
      <div class="ai-toolbar-inner">
        <span class="ai-toolbar-label">
          <span class="ai-badge-icon">✦</span> AI
        </span>
        <button class="ai-generate-btn" type="button">${feature.label}</button>
        ${quotaHtml}
        <span class="ai-toolbar-status" hidden></span>
      </div>
    `;

    const btn = toolbar.querySelector('.ai-generate-btn') as HTMLButtonElement;
    const statusEl = toolbar.querySelector('.ai-toolbar-status') as HTMLElement;

    btn.addEventListener('click', () => run(feature, book, section, btn, statusEl));
    return toolbar;
  }

  // Tracks the active stream's preview element so we can clean it up if cancelled.
  function ensurePreviewEl(section: Element): HTMLElement {
    let el = section.querySelector('.ai-stream-preview') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.className = 'ai-stream-preview';
      section.appendChild(el);
    }
    return el;
  }

  function clearPreview(section: Element) {
    section.querySelector('.ai-stream-preview')?.remove();
  }

  async function run(
    feature: any, book: any, section: Element,
    btn: HTMLButtonElement, statusEl: HTMLElement,
  ) {
    const registry: any = (window as any).AIFeatureRegistry;
    const prompt = registry.buildPrompt(feature.id, book);
    if (!prompt) {
      showError(statusEl, 'Prompt not loaded yet — try again.',
        () => run(feature, book, section, btn, statusEl));
      return;
    }

    // Wire abort: while running, the Generate button becomes a Cancel button.
    const controller = new AbortController();
    const originalLabel = feature.label;
    btn.textContent = 'Cancel';
    btn.classList.add('is-cancel');
    showStatus(statusEl, 'Generating…', 'pending');
    const previewEl = ensurePreviewEl(section);
    previewEl.textContent = '';

    const onCancel = () => controller.abort();
    btn.addEventListener('click', onCancel, { once: true });

    let fullText = '';
    let aborted = false;
    let errored = false;

    await (window as any).MarginaliaAI.generate({
      featureId: feature.id,
      prompt,
      system: 'Return only valid JSON. No markdown fences, no explanation.',
      signal: controller.signal,
      onChunk(delta: string) {
        fullText += delta;
        previewEl.textContent =
          fullText.length > 120 ? `…${fullText.slice(-120)}` : fullText;
      },
      onDone() { /* parsed below */ },
      onError(err: Error) {
        if (err.name === 'AbortError') {
          aborted = true;
        } else {
          errored = true;
          showError(statusEl, err.message,
            () => run(feature, book, section, btn, statusEl));
        }
      },
    });

    // Reset button to its idle Generate state.
    btn.removeEventListener('click', onCancel);
    btn.textContent = originalLabel;
    btn.classList.remove('is-cancel');
    btn.disabled = false;
    clearPreview(section);

    if (aborted) {
      showStatus(statusEl, 'Cancelled.', '');
      return;
    }
    if (errored) return;

    // Parse JSON from the completed stream text.
    let parsed: unknown;
    try {
      const clean = fullText.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      showError(statusEl, 'AI returned invalid JSON. Try again.',
        () => run(feature, book, section, btn, statusEl));
      return;
    }

    const promptVersion = (window as any).AI_PROMPTS?.[feature.promptId]?.version
      ?? FALLBACK_PROMPT_VERSION;
    await saveAiOriginal(book.id, feature.id, parsed, promptVersion);

    injectResult(feature, book, section, parsed, {
      fromCache: false,
      hasUserEdit: false,
      block: { original: parsed, generatedAt: Date.now(), promptVersion },
    });
    showStatus(statusEl, 'Generated', 'ok');
  }

  const CONCEPT_FEATURES = new Set(['concept-cards', 'argument-breakdown']);

  // Panel-render features: AI result is rendered by the registered panel
  // component (read via book._aiData[feature.id]) instead of the inline JSON
  // fallback in renderResult().
  const PANEL_RENDER_FEATURES: Record<string, string> = {
    'mindmap-gen':     'mindmap',
    'concept-cards':   'concept-cards',
    'argument-breakdown': 'concept-cards',
    'timeline-gen':    'timeline',
    'character-map':   'characters',
    'geo-context':     'geo-context',
  };

  function injectResult(
    feature: any, book: any, section: Element, displayData: any,
    { fromCache = false, hasUserEdit = false, block }: {
      fromCache?: boolean; hasUserEdit?: boolean; block: any;
    },
  ) {
    section.querySelector('.ai-generated-block')?.remove();

    // Stash AI result on the book so panel render fns can read it.
    if (!book._aiData) book._aiData = {};
    book._aiData[feature.id] = displayData;

    const canAddToGraph = CONCEPT_FEATURES.has(feature.id)
      && Array.isArray(displayData) && displayData.length > 0;

    const panelId = PANEL_RENDER_FEATURES[feature.id];
    const panel = panelId ? PanelRegistry.get(panelId) : null;
    const usePanel = Boolean(panel?.render);

    const block_el = document.createElement('div');
    block_el.className = 'ai-generated-block';
    block_el.innerHTML = `
      <div class="ai-generated-header">
        <span class="ai-badge">✦ AI Generated</span>
        ${hasUserEdit ? '<span class="ai-user-edited-badge">Edited</span>' : ''}
        <span class="ai-generated-model">${fromCache ? 'cached' : AI_MODEL_LABEL}</span>
        ${canAddToGraph ? `<button class="ai-graph-btn" type="button" title="Add concepts to graph">+ Graph</button>` : ''}
        <button class="ai-edit-btn" type="button" title="Edit">✎ Edit</button>
        ${hasUserEdit ? `<button class="ai-revert-btn" type="button" title="Revert to original">↩ Revert</button>` : ''}
        <button class="ai-regen-btn" type="button" title="Regenerate">↺ Regenerate</button>
        <button class="ai-generated-dismiss" type="button" title="Dismiss">×</button>
      </div>
      <div class="ai-generated-content"></div>
    `;
    const contentEl = block_el.querySelector('.ai-generated-content') as HTMLElement;
    if (usePanel) {
      panel.render(book, contentEl);
    } else {
      contentEl.innerHTML = renderResult(feature, displayData);
    }

    // Dismiss
    block_el.querySelector('.ai-generated-dismiss')!.addEventListener('click', async () => {
      await deleteAiBlock(book.id, feature.id);
      block_el.remove();
    });

    // Regenerate — clears userEdited, re-runs
    block_el.querySelector('.ai-regen-btn')!.addEventListener('click', async () => {
      await clearAiUserEdit(book.id, feature.id);
      block_el.remove();
      const toolbar = section.querySelector('.ai-toolbar');
      const btn = toolbar?.querySelector('.ai-generate-btn') as HTMLButtonElement | null;
      const statusEl = toolbar?.querySelector('.ai-toolbar-status') as HTMLElement | null;
      if (btn && statusEl) await run(feature, book, section, btn, statusEl);
    });

    // Revert to original (only present when hasUserEdit)
    block_el.querySelector('.ai-revert-btn')?.addEventListener('click', async () => {
      await clearAiUserEdit(book.id, feature.id);
      injectResult(feature, book, section, block.original, {
        fromCache: true,
        hasUserEdit: false,
        block: { ...block, userEdited: undefined },
      });
    });

    // Edit button — toggle inline editor
    block_el.querySelector('.ai-edit-btn')!.addEventListener('click', () => {
      openInlineEditor(feature, book, section, block, displayData, block_el);
    });

    // Add to graph
    if (canAddToGraph) {
      const graphBtn = block_el.querySelector('.ai-graph-btn') as HTMLButtonElement;
      graphBtn.addEventListener('click', () => {
        const added = (window as any).MarginaliaGraph?.addConceptsFromAI(book.id, displayData);
        if (added) {
          graphBtn.textContent = '✓ Added';
          graphBtn.disabled = true;
        } else {
          graphBtn.textContent = 'Already added';
          graphBtn.disabled = true;
        }
      });
    }

    section.appendChild(block_el);
    if (!fromCache) block_el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function openInlineEditor(
    feature: any, book: any, section: Element,
    block: any, displayData: any, block_el: HTMLElement,
  ) {
    const contentEl = block_el.querySelector('.ai-generated-content') as HTMLElement;
    const editBtn = block_el.querySelector('.ai-edit-btn') as HTMLButtonElement;
    if (block_el.querySelector('.ai-edit-area')) return; // already open

    // Serialize current display value to editable JSON string
    const jsonStr = JSON.stringify(displayData, null, 2);

    const editor = document.createElement('div');
    editor.className = 'ai-edit-area';
    editor.innerHTML = `
      <textarea class="ai-edit-textarea" spellcheck="false">${esc(jsonStr)}</textarea>
      <div class="ai-edit-actions">
        <button class="ai-edit-save" type="button">Save edit</button>
        <button class="ai-edit-cancel" type="button">Cancel</button>
      </div>
    `;

    contentEl.after(editor);
    contentEl.style.display = 'none';
    editBtn.textContent = '✎ Editing…';
    editBtn.disabled = true;

    const textarea = editor.querySelector('.ai-edit-textarea') as HTMLTextAreaElement;

    editor.querySelector('.ai-edit-cancel')!.addEventListener('click', () => {
      editor.remove();
      contentEl.style.display = '';
      editBtn.textContent = '✎ Edit';
      editBtn.disabled = false;
    });

    editor.querySelector('.ai-edit-save')!.addEventListener('click', async () => {
      let parsed: any;
      try {
        parsed = JSON.parse(textarea.value);
      } catch {
        textarea.classList.add('ai-edit-error');
        return;
      }
      await saveAiUserEdit(book.id, feature.id, parsed);
      injectResult(feature, book, section, parsed, {
        fromCache: true,
        hasUserEdit: true,
        block: { ...block, userEdited: parsed },
      });
    });
  }

  function renderResult(feature: any, result: any): string {
    switch (feature.id) {

      case 'mindmap-gen':
      case 'timeline-gen': {
        const timeline = Array.isArray(result) ? result : (result?.timeline || []);
        return timeline.map((group: any) => `
          <div class="ai-timeline-group">
            <div class="ai-timeline-era">${esc(group.era || '')}</div>
            ${(group.items || []).map((item: any) => `
              <div class="ai-timeline-item">
                <span class="ai-timeline-year">${esc(item.year || '')}</span>
                <span class="ai-timeline-title">${esc(item.title || '')}</span>
                <div class="ai-pill-row">${(item.tags || []).map((t: string) => `<span class="ai-pill">${esc(t)}</span>`).join('')}</div>
              </div>
            `).join('')}
          </div>
        `).join('');
      }

      case 'concept-cards':
      case 'argument-breakdown': {
        const items = Array.isArray(result) ? result : [];
        return `<div class="ai-concept-grid">${items.map((c: any) => `
          <div class="ai-concept-card">
            <div class="ai-concept-tag">${esc(c.contextTag || '')}</div>
            <h4>${esc(c.name || '')}</h4>
            <p>${esc(c.description || '')}</p>
            ${c.readerUnderstanding ? `<p class="ai-concept-reader"><em>${esc(c.readerUnderstanding)}</em></p>` : ''}
          </div>
        `).join('')}</div>`;
      }

      case 'action-suggest': {
        const items = Array.isArray(result) ? result : [];
        return `<ul class="ai-action-list">${items.map((a: any) => `
          <li class="ai-action-item">
            <div class="ai-action-check"></div>
            <div class="ai-action-text">${esc(a.text || a)}</div>
          </li>
        `).join('')}</ul>`;
      }

      default:
        return `<pre class="ai-raw">${esc(JSON.stringify(result, null, 2))}</pre>`;
    }
  }

  function showStatus(el: HTMLElement, msg: string, type: string) {
    el.textContent = msg;
    el.hidden = !msg;
    el.className = 'ai-toolbar-status' + (type ? ` ai-status-${type}` : '');
  }

  function showError(el: HTMLElement, msg: string, retryFn: () => void) {
    el.hidden = false;
    el.className = 'ai-toolbar-status ai-status-error';
    el.innerHTML = `
      <span class="ai-status-text">${esc(msg)}</span>
      <button class="ai-retry-btn" type="button">Retry</button>
    `;
    el.querySelector('.ai-retry-btn')?.addEventListener('click', retryFn, { once: true });
  }

  function esc(s: unknown): string {
    return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] ?? c));
  }

  return { mount };
})();
