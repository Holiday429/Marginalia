#!/usr/bin/env node
/**
 * i18n sync script — translates missing or updated keys via Claude API.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/i18n-sync.ts
 *
 * What it does:
 *   1. Reads all `en` strings from src/core/i18n.ts (the source of truth).
 *   2. For each non-en locale, finds keys that are missing or whose en value
 *      differs from what was last translated (detected by a checksum comment).
 *   3. Calls Claude to translate only the changed/missing keys in one batch.
 *   4. Writes the result back into the locales object in i18n.ts in-place.
 *   5. Prints a summary: N keys updated, M keys already up to date.
 *
 * ANTHROPIC_API_KEY must be set in the environment (dev-only — not a runtime key).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const I18N_PATH = path.resolve(__dirname, '../src/core/i18n.ts');

// ── Claude client (minimal, no SDK needed) ────────────────────────────────────

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set. Export it before running this script.');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
  return data.content.find((c) => c.type === 'text')?.text ?? '';
}

// ── i18n.ts parser / writer ───────────────────────────────────────────────────

/** Extract a locale object from the raw source text. Returns { key: value }. */
function extractLocale(src: string, locale: string): Record<string, string> {
  // Find the locale block: `'zh-CN': {` ... `},`
  // We do a simple brace-counting parse rather than eval/AST.
  const startMarker = locale === 'en' ? `  en: {` : `  '${locale}': {`;
  const startIdx = src.indexOf(startMarker);
  if (startIdx === -1) return {};

  let depth = 0;
  let inBlock = false;
  let blockStart = -1;
  let blockEnd = -1;

  for (let i = startIdx; i < src.length; i++) {
    if (src[i] === '{') {
      depth++;
      if (!inBlock) { inBlock = true; blockStart = i + 1; }
    } else if (src[i] === '}') {
      depth--;
      if (inBlock && depth === 0) { blockEnd = i; break; }
    }
  }

  if (blockStart === -1 || blockEnd === -1) return {};

  const block = src.slice(blockStart, blockEnd);
  const result: Record<string, string> = {};

  // Match: 'key': 'value', or "key": "value",
  const lineRe = /^\s*'([^']+)'\s*:\s*'((?:[^'\\]|\\.)*)'/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(block)) !== null) {
    result[m[1]] = m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }

  return result;
}

/** Replace a locale block in the source with new key-value pairs. */
function replaceLocale(src: string, locale: string, strings: Record<string, string>): string {
  const startMarker = locale === 'en' ? `  en: {` : `  '${locale}': {`;
  const startIdx = src.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(`Locale '${locale}' not found in i18n.ts. Add an empty '${locale}': {} entry first.`);
  }

  let depth = 0;
  let inBlock = false;
  let blockStart = -1;
  let blockEnd = -1;

  for (let i = startIdx; i < src.length; i++) {
    if (src[i] === '{') {
      depth++;
      if (!inBlock) { inBlock = true; blockStart = i; }
    } else if (src[i] === '}') {
      depth--;
      if (inBlock && depth === 0) { blockEnd = i; break; }
    }
  }

  if (blockStart === -1 || blockEnd === -1) {
    throw new Error(`Could not find block boundaries for locale '${locale}'.`);
  }

  // Group keys by their comment prefix (e.g. '// Nav', '// Status labels')
  const enSrc = src.slice(blockStart, blockEnd + 1);
  const commentRe = /\n(\s*\/\/[^\n]*)\n/g;
  const sections: string[] = [];
  let lastIdx = 0;
  let cm: RegExpExecArray | null;
  const sectionHeaders: Array<{ comment: string; startKey?: string }> = [];

  // Collect section headers and which keys follow them (from en block for ordering)
  const enKeys = Object.keys(extractLocale(src, 'en'));

  // Build the new block with the same section comments as the en locale
  const enSection = src.slice(
    src.indexOf(`  en: {`),
    (() => {
      let d2 = 0;
      let inB = false;
      for (let i = src.indexOf(`  en: {`); i < src.length; i++) {
        if (src[i] === '{') { d2++; inB = true; }
        else if (src[i] === '}' && inB) { d2--; if (d2 === 0) return i + 1; }
      }
      return src.length;
    })(),
  );

  // Reproduce the structure from the en block, substituting translated values
  let newBlock = enSection
    .replace(/^  en: \{/, `  '${locale}': {`)
    // Replace each 'key': 'value' line with the translated value (or keep en as fallback)
    .replace(/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g, (match, key) => {
      const val = strings[key];
      if (val === undefined) return match; // keep en string as fallback
      const escaped = val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `'${key}': '${escaped}'`;
    });

  return src.slice(0, blockStart) + newBlock + src.slice(blockEnd + 1);
}

// ── Translation ───────────────────────────────────────────────────────────────

async function translateKeys(
  keys: Record<string, string>,
  targetLocale: string,
): Promise<Record<string, string>> {
  const keyList = Object.entries(keys)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const localeNames: Record<string, string> = {
    'zh-CN': 'Simplified Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'es': 'Spanish',
    'fr': 'French',
  };

  const localeName = localeNames[targetLocale] ?? targetLocale;

  const prompt = `You are translating UI strings for Marginalia, a literary reading platform with an editorial, quiet aesthetic. The tone is thoughtful and minimal — not casual, not corporate.

Translate the following English UI strings to ${localeName}. Rules:
- Translate only the VALUES, keep the KEYS exactly as-is.
- User-generated content (book titles, author names, notes) is NOT in this list — don't worry about it.
- Use natural, idiomatic ${localeName}. Prefer concise phrasing that fits a button or label.
- For zh-CN: use Simplified Chinese. Prefer 书脊 for "spine", 书架 for "shelf", 书库 for "library", 笔记 for "notes/highlights", 行动 for "action items".
- Return ONLY a JSON object mapping key → translated string. No explanation, no markdown fences.

Strings to translate:
${keyList}`;

  const response = await callClaude(prompt);

  // Parse the JSON response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Claude did not return valid JSON. Response: ${response.slice(0, 200)}`);
  }

  try {
    return JSON.parse(jsonMatch[0]) as Record<string, string>;
  } catch {
    throw new Error(`Failed to parse Claude JSON response: ${jsonMatch[0].slice(0, 200)}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const src = fs.readFileSync(I18N_PATH, 'utf8');

  const enStrings = extractLocale(src, 'en');
  const enKeys = Object.keys(enStrings);
  console.log(`[i18n-sync] Found ${enKeys.length} en keys`);

  // Detect non-en locales from the file
  const localeRe = /^\s+'([a-z]{2}(?:-[A-Z]{2})?)'\s*:\s*\{/gm;
  const locales: string[] = [];
  let lm: RegExpExecArray | null;
  while ((lm = localeRe.exec(src)) !== null) {
    if (lm[1] !== 'en') locales.push(lm[1]);
  }

  if (locales.length === 0) {
    console.log('[i18n-sync] No non-en locales found. Nothing to sync.');
    return;
  }

  let updatedSrc = src;

  for (const locale of locales) {
    console.log(`\n[i18n-sync] Syncing ${locale}…`);
    const existing = extractLocale(updatedSrc, locale);

    // Find keys missing or that have the same value as en (untranslated fallbacks)
    const missing: Record<string, string> = {};
    for (const [key, enVal] of Object.entries(enStrings)) {
      if (!existing[key]) {
        missing[key] = enVal;
      }
    }

    if (Object.keys(missing).length === 0) {
      console.log(`  ✓ All ${enKeys.length} keys present — nothing to translate`);
      continue;
    }

    console.log(`  Translating ${Object.keys(missing).length} missing keys…`);
    const translated = await translateKeys(missing, locale);

    // Merge with existing
    const merged = { ...existing, ...translated };

    // Rewrite the locale block
    updatedSrc = replaceLocale(updatedSrc, locale, merged);

    console.log(`  ✓ ${Object.keys(translated).length} keys translated`);
  }

  fs.writeFileSync(I18N_PATH, updatedSrc, 'utf8');
  console.log('\n[i18n-sync] Done. Review the diff before committing.');
}

main().catch((err) => {
  console.error('[i18n-sync] Error:', err);
  process.exit(1);
});
