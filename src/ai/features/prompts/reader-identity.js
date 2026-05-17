/* Prompt: reader-identity
   Target: Profile page — Reading Identity section
   Input: user's full library (titles, authors, genres, languages, geo, highlights, reading rhythm)
   Output: JSON with readerType label, portrait paragraph, and three character traits

   version: 1
*/
import { AIFeatureRegistry } from '../registry.js';

AIFeatureRegistry.setPrompt('reader-identity', {
  version: '1',

  build(library) {
    const bookList = (library.books || [])
      .slice(0, 60)
      .map(b => {
        const parts = [`"${b.title}" by ${b.author}`];
        if (b.genre) parts.push(`[${b.genre}]`);
        if (b.language) parts.push(`(${b.language})`);
        if (b.year) parts.push(String(b.year));
        return `- ${parts.join(' ')}`;
      })
      .join('\n');

    const highlightSample = (library.highlightSample || [])
      .slice(0, 20)
      .map(h => `- "${h.quote}"`)
      .join('\n');

    const rhythmNote = library.rhythmNote || '';

    return `You are writing a personal reading identity card for a reader, based on their library and margin notes.

Library (${library.books?.length ?? 0} books):
${bookList || '(none)'}

Highlights and margin notes:
${highlightSample || '(none)'}

Reading rhythm:
${rhythmNote || '(none)'}

Return ONLY a valid JSON object in this exact shape — no markdown fences, no explanation:

{
  "readerType": "string — a short evocative phrase (5–10 words) that captures this reader's essential character. Not a genre label. Something like: 'A traveller who never leaves the page' or 'Someone building a private archive of the world'. Be specific to their actual books.",
  "portrait": "string — 3–4 sentences in second person (\"You read like...\"). Describe what draws them to books, how they read, what the pattern of their choices reveals. Be literary, warm, and precise. Reference actual books or authors from the list — don't generalise. No lists, no bullet points. Pure prose.",
  "traits": [
    {
      "label": "string — 1–2 word trait name (e.g. 'Deep Diver', 'Border Crosser', 'Night Reader')",
      "description": "string — one sentence explaining what this trait reveals about how they read, tied to evidence from the library"
    },
    {
      "label": "string",
      "description": "string"
    },
    {
      "label": "string",
      "description": "string"
    }
  ],
  "promptVersion": "1",
  "generatedAt": ${Date.now()}
}

Rules:
- readerType must feel discovered, not manufactured — earn it from the data
- portrait must reference at least 2 specific books or authors from the list
- traits must each describe a different dimension: one about what they read, one about how, one about why or when
- tone: a thoughtful friend who has read your bookshelf, not an algorithm
- Return ONLY the JSON object`;
  }
});
