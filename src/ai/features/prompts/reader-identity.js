/* Prompt: reader-identity
   Target: Profile page — Reading Identity section
   Input: user's full library (titles, authors, genres, languages, geo, highlights, reading rhythm)
   Output: JSON with archetype, hook, readerType, portrait, traits (with intensity), dispatches

   version: 2
*/
import { AIFeatureRegistry } from '../registry.js';

AIFeatureRegistry.setPrompt('reader-identity', {
  version: '2',

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
  "archetype": "one of exactly these 7 values: Border Crosser | Interior Cartographer | Slow Burn | Theme Hunter | Era Swimmer | Prize Chaser | Contrarian — choose the single best fit. Border Crosser = reads across ≥4 countries. Interior Cartographer = ≥80% fiction, few countries. Slow Burn = long sessions per book. Theme Hunter = narrow genres, many authors. Era Swimmer = ≥60% same decade. Prize Chaser = varied, trusted-curator shelf. Contrarian = reading against the mainstream.",
  "hook": "1–2 sentences that directly speak to what this archetype means for this reader. Warm and specific, not generic.",
  "readerType": "string — a short evocative phrase (5–10 words) that captures this reader's essential character. Not a genre label.",
  "portrait": "string — 3–4 sentences in second person. Describe what draws them to books, how they read, what the pattern reveals. Reference actual books or authors. Pure prose.",
  "traits": [
    {
      "label": "string — 1–2 word trait name",
      "description": "string — one sentence tied to evidence from the library",
      "intensity": 0
    },
    {
      "label": "string",
      "description": "string",
      "intensity": 0
    },
    {
      "label": "string",
      "description": "string",
      "intensity": 0
    }
  ],
  "dispatches": ["string", "string", "string"],
  "promptVersion": "2",
  "generatedAt": ${Date.now()}
}

Rules:
- archetype must be exactly one of the 7 listed values — no invented values
- hook must be specific to this reader's data, not the generic archetype description
- traits[].intensity is 0–100 integer — how strongly this trait manifests (derive from the evidence: a reader with 40+ highlights gets high Slow Heat; 8+ countries gets high World Builder; etc.)
- dispatches: 3–5 one-line reading facts (e.g. "12 books finished", "Read across 9 countries", "Primarily reading in Chinese"). Plain facts, no adjectives.
- portrait must reference at least 2 specific books or authors from the list
- tone: a thoughtful friend who has read your bookshelf, not an algorithm
- Return ONLY the JSON object`;
  }
});
