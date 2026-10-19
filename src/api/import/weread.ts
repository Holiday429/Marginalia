/* Marginalia · WeChat Read (微信读书) exported notes, pasted as text → ImportedBook (plan 2.5). Pure.

   The app's "copy all notes" output looks like this (blank lines between blocks):

     《人类简史》
     尤瓦尔·赫拉利
     12个笔记

     ◆ 第一部分 认知革命

     >> 农业革命是史上最大的骗局。
     发表想法：我觉得他说得太绝对。

   Recognised, in a forgiving way:
     《title》 then the author on the next line   → a book (a pasted export may hold several)
     "◆ text", "# text", "## text"                → chapter heading; it applies to the highlights below it
     ">> text", "> text", "▌ text", "📌 text"       → highlight (continues over following plain lines)
     "发表想法：", "想法：", "[想法]", "💭" text     → the reader's thought; it becomes the note of the highlight above it
   A thought with no highlight above it is kept as a highlight of its own. Lines that are only counts
   ("12个笔记") are ignored.
*/

import type { ImportedBook, ImportedHighlight, ParseResult } from './types.ts';

const BOOK = /^《(.+?)》\s*$/u;
const COUNT = /^\d+\s*(个|条)?\s*(笔记|划线|想法|标注)\s*$/u;
const CHAPTER = /^(?:◆|#{1,3})\s+(.+)$/u;
const HIGHLIGHT = /^(?:>>|▌|📌|>)\s*(.+)$/u;
const THOUGHT = /^(?:发表想法[:：]|想法[:：]|\[想法\]|💭)\s*(.*)$/u;

export function looksLikeWeRead(text: string): boolean {
  return /^《.+?》\s*$/mu.test(text) && (/^(?:◆|>>|▌|📌)/mu.test(text) || /想法/u.test(text));
}

export function parseWeRead(text: string): ParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim());
  const warnings: string[] = [];
  const books: ImportedBook[] = [];
  let book: ImportedBook | null = null;
  let chapter = '';
  let current: ImportedHighlight | null = null;
  let mode: 'none' | 'highlight' | 'thought' = 'none';
  let expectAuthor = false;

  const finishHighlight = () => { current = null; mode = 'none'; };

  for (const line of lines) {
    if (!line) { mode = 'none'; continue; }
    const b = BOOK.exec(line);
    if (b) {
      book = { title: b[1].trim(), author: '', highlights: [] };
      books.push(book);
      chapter = '';
      finishHighlight();
      expectAuthor = true;
      continue;
    }
    if (!book) { warnings.push(`Text before the first 《book title》 line was ignored: "${line.slice(0, 30)}"`); continue; }
    if (COUNT.test(line)) { expectAuthor = false; continue; }
    if (expectAuthor && !CHAPTER.test(line) && !HIGHLIGHT.test(line) && !THOUGHT.test(line)) {
      book.author = line;
      expectAuthor = false;
      continue;
    }
    expectAuthor = false;

    const c = CHAPTER.exec(line);
    if (c) { chapter = c[1].trim(); finishHighlight(); continue; }

    const t = THOUGHT.exec(line);
    if (t) {
      if (current) { current.note = t[1].trim(); mode = 'thought'; }
      else {
        const standalone: ImportedHighlight = { quote: t[1].trim(), ...(chapter ? { chapter } : {}) };
        book.highlights.push(standalone);
        current = standalone;
        mode = 'highlight';
      }
      continue;
    }

    const h = HIGHLIGHT.exec(line);
    if (h) {
      current = { quote: h[1].trim(), ...(chapter ? { chapter } : {}) };
      book.highlights.push(current);
      mode = 'highlight';
      continue;
    }

    // A plain line continues whatever block is open; with nothing open it is a highlight of its own.
    if (current && mode === 'highlight') current.quote += `\n${line}`;
    else if (current && mode === 'thought') current.note = `${current.note ?? ''}\n${line}`.trim();
    else {
      current = { quote: line, ...(chapter ? { chapter } : {}) };
      book.highlights.push(current);
      mode = 'highlight';
    }
  }

  const usable = books.filter((x) => x.highlights.length > 0);
  if (!usable.length) warnings.push('No notes found. Paste the text from WeChat Read: "my notes" → copy all.');
  return { source: 'weread', books: usable, warnings };
}
