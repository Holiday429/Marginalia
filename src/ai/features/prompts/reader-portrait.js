/* Prompt: reader-portrait
   Target: public profile page — Reader Portrait section
   Input: the user's full library (genres, languages, years, highlight themes)
   Output: JSON with a narrative paragraph + three breakdown arrays

   version: 1
*/
import { AIFeatureRegistry } from '../registry.ts';

AIFeatureRegistry.setPrompt('reader-portrait', {
  version: '1',

  // Called with a synthetic "book" object that is actually the full library summary.
  // profile.ts constructs this object before calling ai-gateway.
  build(library) {
    const bookList = (library.books || [])
      .slice(0, 60)
      .map(b => `- "${b.title}" by ${b.author}${b.genre ? ` [${b.genre}]` : ''}${b.language ? ` (${b.language})` : ''}${b.year ? `, ${b.year}` : ''}`)
      .join('\n');

    const highlightThemes = (library.highlightSample || [])
      .slice(0, 30)
      .map(h => `- "${h.quote}"`)
      .join('\n');

    return `You are a literary critic writing a brief, precise portrait of a reader based on their library.

Library (${library.books?.length ?? 0} books shared):
${bookList || '(none)'}

A sample of their margin notes and highlights:
${highlightThemes || '(none)'}

Write a reader portrait in the following JSON format — no markdown fences, only valid JSON:

{
  "narrative": "string — 3–4 sentences in second person (\"You read like...\"). Describe their reading character: what draws them, how they read, what the margins reveal. Be literary and specific. Avoid generic praise. Do not list genres — evoke them.",
  "promptVersion": "1",
  "generatedAt": ${Date.now()},
  "breakdowns": {
    "genre": [
      { "label": "string — genre name", "pct": number 0–100 }
    ],
    "era": [
      { "label": "string — era name (e.g. 'Post-war (1945+)')", "pct": number 0–100 }
    ],
    "theme": [
      { "label": "string — margin theme (e.g. 'Memory & loss')", "pct": number 0–100 }
    ]
  }
}

Rules:
- genre: 4–5 entries, sum to 100
- era: 3–4 entries based on publication / author lifetime, sum to 100
- theme: 4–5 inferred themes from the highlight sample, sum to 100
- narrative must be based on the actual books and highlights given — no invented details
- Return ONLY the JSON object, no explanation`;
  }
});
