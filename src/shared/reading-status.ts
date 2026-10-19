// Marginalia · Reading status — single vocabulary shared by Add Book, the book
// detail page, Search and the Library shelves (shelf id = status).

export type ReadingStatus = 'reading' | 'want' | 'finished' | 'confirmed-later';

export const READING_STATUS_OPTIONS: ReadonlyArray<{ value: ReadingStatus; label: string }> = [
  { value: 'reading',         label: 'Reading' },
  { value: 'want',            label: 'To Read' },
  { value: 'finished',        label: 'Finished' },
  { value: 'confirmed-later', label: 'Confirm Later' },
];

/** Map any stored/legacy status value onto the shared vocabulary. */
export function normalizeReadingStatus(raw: unknown): ReadingStatus {
  const value = String(raw ?? '').trim();
  if (value === 'reading') return 'reading';
  if (value === 'finished' || value === 'read') return 'finished';
  if (value === 'want' || value === 'to-read' || value === 'wishlist' || value === 'unread') return 'want';
  return 'confirmed-later';
}

export function readingStatusLabel(raw: unknown): string {
  const status = normalizeReadingStatus(raw);
  return READING_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'Confirm Later';
}
