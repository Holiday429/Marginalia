/* Prompt: character-map
   Target panel: characters (fiction)
   Output: JSON array of character objects
*/
import { AIFeatureRegistry } from "../registry.ts";

AIFeatureRegistry.setPrompt('character-map', {
  build(book) {
    const highlights = (book.highlights || []).map(h => `- "${h.quote}"`).join('\n');
    return `You are a literary analyst. Map the characters from this fiction book.

Book: "${book.title}" by ${book.author}
Summary: ${book.summary || ''}
Reader highlights:
${highlights || '(none)'}

Return a JSON array with EXACTLY this shape:
[
  {
    "name": "string — character name",
    "role": "string — one of: protagonist, antagonist, supporting, minor",
    "description": "string — who they are in 1-2 sentences",
    "traits": ["string — 3-5 character traits"],
    "arc": "string — how this character changes across the story",
    "relationships": [
      { "with": "string — other character name", "type": "string — e.g. ally, rival, mentor, family" }
    ],
    "keyMoment": "string — the most important scene for this character"
  }
]

Rules:
- Include protagonist + 3–6 significant characters
- relationships only reference other characters in the list
- Return ONLY the JSON array, no markdown, no explanation`;
  }
});
