/* Marginalia · small RFC 4180 CSV reader (plan 2.5): quoted fields, doubled quotes, commas and line breaks
   inside quotes, CRLF or LF, a leading byte-order mark. Returns rows as objects keyed by lower-cased header. */

export function parseCsvRows(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

export interface CsvTable { headers: string[]; rows: Array<Record<string, string>> }

export function parseCsv(text: string): CsvTable {
  const all = parseCsvRows(text);
  if (!all.length) return { headers: [], rows: [] };
  const headers = all[0].map((h) => h.trim().toLowerCase());
  const rows = all.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => { if (h) record[h] = (cells[i] ?? '').trim(); });
    return record;
  });
  return { headers, rows };
}
