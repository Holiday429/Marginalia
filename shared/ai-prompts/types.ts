// Server-assembled prompt inputs. Built by the aiGenerate Cloud Function from Firestore —
// the client never supplies prompt text or prompt data.

export interface BookCtx {
  title: string;
  author: string;
  year?: number | string;
  bookType?: string;
  summary?: string;
  tags?: string[];
  highlights?: Array<{ page?: number | string | null; quote: string; kind?: string | null }>;
  actions?: Array<{ text: string }>;
  insight?: { integration?: string; oneLiner?: string };
  mindmap?: { timeline?: unknown };
}

export interface LibraryCtx {
  books?: Array<{ title: string; author: string; genre?: string; language?: string; year?: number | string }>;
  highlightSample?: Array<{ quote: string }>;
  rhythmNote?: string;
}
