/* Marginalia · quick capture: pure helpers (kept free of browser imports so they can be unit-tested). */

export interface BookChoice { id: string; title: string; author: string; status: string }

const MAX_SUGGESTIONS = 5;

/** How far the on-screen keyboard covers the bottom of the layout viewport (0 when it is closed). */
export function keyboardInset(layoutHeight: number, viewport: { height: number; offsetTop: number }): number {
  return Math.max(0, Math.round(layoutHeight - viewport.height - viewport.offsetTop));
}

export function suggestBooks(books: BookChoice[], query: string): BookChoice[] {
  const q = query.trim().toLowerCase();
  const pool = q
    ? books.filter((b) => `${b.title} ${b.author}`.toLowerCase().includes(q))
    : [...books].sort((a, b) => Number(b.status === 'reading') - Number(a.status === 'reading'));
  return pool.slice(0, MAX_SUGGESTIONS);
}
