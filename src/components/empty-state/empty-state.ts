/* Marginalia · empty state (plan 2.2)
   One source for the "nothing here yet" blocks on the book page tabs: what the tab is for, and the
   first thing to do. Returns markup so both template-string views and DOM panels can use it.
*/

import './empty-state.css';

export interface EmptyStateCopy {
  title: string;
  body: string;
}

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export const TAB_EMPTY_STATES = {
  highlights: {
    title: 'No highlights yet',
    body: 'Add a line you want to keep, or import your Kindle clippings with the buttons above. On any page, press C to capture one in a few seconds.',
  },
  'visual-notes': {
    title: 'No visual notes yet',
    body: 'Turn this book into a mind map, a character map or a timeline with the AI button above, or import notes you made elsewhere.',
  },
  mindmap: {
    title: 'No mind map yet',
    body: 'Use the AI button above to lay out the structure of this book. It works best once you have saved a few highlights.',
  },
  'concept-cards': {
    title: 'No concept cards yet',
    body: 'Use the AI button above to pull out the key ideas. You can edit every card afterwards.',
  },
  timeline: {
    title: 'No timeline yet',
    body: 'Use the AI button above to order the events of this book. You can edit the result afterwards.',
  },
  characters: {
    title: 'No character map yet',
    body: 'Use the AI button above to map who matters and how they relate. You can edit the result afterwards.',
  },
  'geo-context': {
    title: 'No places yet',
    body: 'Use the AI button above to list the places this book visits and what makes each one matter.',
  },
  'cultural-context': {
    title: 'No extra context yet',
    body: 'The pre-read card on Overview covers the author, the period and the place. Use the AI button above for concept cards and deeper background.',
  },
  'related-books': {
    title: 'No related books yet',
    body: 'Add tags to this book on Overview. Books that share a tag appear here and in the Graph.',
  },
  actions: {
    title: 'No actions yet',
    body: 'Write one thing you will do because of this book. You will be reminded after 7, 30 and 90 days.',
  },
} satisfies Record<string, EmptyStateCopy>;

export type TabEmptyStateId = keyof typeof TAB_EMPTY_STATES;

export function renderEmptyState(copy: EmptyStateCopy): string {
  return `<div class="empty-state" data-empty-state>
    <h3 class="empty-state__title">${esc(copy.title)}</h3>
    <p class="empty-state__body">${esc(copy.body)}</p>
  </div>`;
}

export function renderTabEmptyState(id: TabEmptyStateId): string {
  return renderEmptyState(TAB_EMPTY_STATES[id]);
}
