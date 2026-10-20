/* Marginalia · Library mode switch (plan 2.8, option B)
   Library is one nav item with two modes: Browse (filter and open books, the old Search page) and Arrange
   (drag books on shelves, the old Library page). The two modes are the two existing pages; the switch only
   moves between them through the normal `data-view` routing, so `#search` and `#library` keep working.
*/

export type LibraryMode = 'browse' | 'arrange';

/** Route of each mode. Browse is the old `#search` page, Arrange the old `#library` page. */
export const LIBRARY_MODE_ROUTE: Record<LibraryMode, string> = { browse: 'search', arrange: 'library' };

export function renderLibraryModeSwitch(active: LibraryMode): string {
  const button = (mode: LibraryMode, label: string) => `
      <button class="lib-mode__btn${mode === active ? ' is-active' : ''}" type="button" data-view="${LIBRARY_MODE_ROUTE[mode]}" aria-pressed="${mode === active}">${label}</button>`;
  return `
    <div class="lib-mode" role="group" aria-label="Library mode">${button('browse', 'Browse')}${button('arrange', 'Arrange')}
    </div>
  `;
}
