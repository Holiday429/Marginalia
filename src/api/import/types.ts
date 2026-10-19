/* Marginalia · import: the shape every source is parsed into (plan 2.5). */

export type ImportSource = 'goodreads' | 'storygraph' | 'readwise' | 'weread' | 'kindle';

export const IMPORT_SOURCE_LABEL: Record<ImportSource, string> = {
  goodreads: 'Goodreads',
  storygraph: 'StoryGraph',
  readwise: 'Readwise',
  weread: 'WeChat Read',
  kindle: 'Kindle',
};

export interface ImportedHighlight {
  quote: string;
  /** The reader's own comment on the quote (a WeChat Read "thought", a Readwise note, a Kindle note). */
  note?: string;
  chapter?: string;
  page?: number;
  /** Kindle / Readwise location, e.g. "120-121" */
  location?: string;
  /** epoch ms, when the source knows it */
  createdAt?: number;
}

export type ImportedStatus = 'reading' | 'want' | 'finished' | 'confirmed-later';

export interface ImportedBook {
  title: string;
  author: string;
  isbn?: string;
  status?: ImportedStatus;
  /** 1 to 5 */
  rating?: number;
  /** YYYY-MM-DD */
  finishedOn?: string;
  /** YYYY-MM-DD */
  addedOn?: string;
  year?: number;
  tags?: string[];
  highlights: ImportedHighlight[];
}

export interface ParseResult {
  source: ImportSource;
  books: ImportedBook[];
  /** Rows or blocks that could not be used, with a short reason; shown on the preview page. */
  warnings: string[];
}
