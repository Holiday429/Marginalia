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

const FALLBACK_PROMPT_VERSION = '1';

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
    const panelToSectionId: Record<string, string> = {
      'mindmap':        'knowledge',
      'concept-cards':  'concepts',
      'actions':        'actions',
      'geo-context':    'cultural',
      'characters':     'characters',
      'timeline':       'knowledge',
    };
    const sectionId = panelToSectionId[feature.panel] || feature.panel;
    return root.querySelector(`.book-section#${CSS.escape(sectionId)}`);
  }

  function buildToolbar(feature: any, book: any, section: Element): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'ai-toolbar';
    toolbar.innerHTML = `
      <div class="ai-toolbar-inner">
        <span class="ai-toolbar-label">
          <span class="ai-badge-icon">✦</span> AI
        </span>
        <button class="ai-generate-btn" type="button">${feature.label}</button>
        <span class="ai-toolbar-status" hidden></span>
      </div>
    `;

    const btn = toolbar.querySelector('.ai-generate-btn') as HTMLButtonElement;
    const statusEl = toolbar.querySelector('.ai-toolbar-status') as HTMLElement;

    btn.addEventListener('click', () => run(feature, book, section, btn, statusEl));
    return toolbar;
  }

  async function run(
    feature: any, book: any, section: Element,
    btn: HTMLButtonElement, statusEl: HTMLElement,
  ) {
    const registry: any = (window as any).AIFeatureRegistry;
    const prompt = registry.buildPrompt(feature.id, book);
    if (!prompt) {
      showStatus(statusEl, 'Prompt not loaded yet — try again.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Generating…';
    showStatus(statusEl, '', '');

    const result = await (window as any).MarginaliaAI.generateJSON({
      prompt,
      onError(err: Error) {
        showStatus(statusEl, err.message, 'error');
        btn.disabled = false;
        btn.textContent = feature.label;
      },
    });

    btn.disabled = false;
    btn.textContent = feature.label;

    if (!result) return;

    // Persist as AiBlock with promptVersion
    const promptVersion = (window as any).AI_PROMPTS?.[feature.promptId]?.version
      ?? FALLBACK_PROMPT_VERSION;
    await saveAiOriginal(book.id, feature.id, result, promptVersion);

    injectResult(feature, book, section, result, {
      fromCache: false,
      hasUserEdit: false,
      block: { original: result, generatedAt: Date.now(), promptVersion },
    });
    showStatus(statusEl, 'Generated', 'ok');
  }

  const CONCEPT_FEATURES = new Set(['concept-cards', 'argument-breakdown']);

  function injectResult(
    feature: any, book: any, section: Element, displayData: any,
    { fromCache = false, hasUserEdit = false, block }: {
      fromCache?: boolean; hasUserEdit?: boolean; block: any;
    },
  ) {
    section.querySelector('.ai-generated-block')?.remove();

    const canAddToGraph = CONCEPT_FEATURES.has(feature.id)
      && Array.isArray(displayData) && displayData.length > 0;

    const block_el = document.createElement('div');
    block_el.className = 'ai-generated-block';
    block_el.innerHTML = `
      <div class="ai-generated-header">
        <span class="ai-badge">✦ AI Generated</span>
        ${hasUserEdit ? '<span class="ai-user-edited-badge">Edited</span>' : ''}
        <span class="ai-generated-model">${fromCache ? 'cached' : 'deepseek-chat'}</span>
        ${canAddToGraph ? `<button class="ai-graph-btn" type="button" title="Add concepts to graph">+ Graph</button>` : ''}
        <button class="ai-edit-btn" type="button" title="Edit">✎ Edit</button>
        ${hasUserEdit ? `<button class="ai-revert-btn" type="button" title="Revert to original">↩ Revert</button>` : ''}
        <button class="ai-regen-btn" type="button" title="Regenerate">↺ Regenerate</button>
        <button class="ai-generated-dismiss" type="button" title="Dismiss">×</button>
      </div>
      <div class="ai-generated-content">
        ${renderResult(feature, displayData)}
      </div>
    `;

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

  function esc(s: unknown): string {
    return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] ?? c));
  }

  return { mount };
})();
