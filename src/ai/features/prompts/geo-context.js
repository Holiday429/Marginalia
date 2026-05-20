/* Prompt: geo-context
   Target panel: geo-context (travel)
   Output: JSON array of place objects
*/
import { AIFeatureRegistry } from "../registry.js";

AIFeatureRegistry.setPrompt('geo-context', {
  build(book) {
    const highlights = (book.highlights || []).map(h => `- "${h.quote}"`).join('\n');
    return `You are a cultural geographer. Identify the key places in this travel or geography-focused book and provide cultural context.

Book: "${book.title}" by ${book.author}
Summary: ${book.summary || ''}
Reader highlights:
${highlights || '(none)'}

Return a JSON array with EXACTLY this shape:
[
  {
    "place": "string — city, region, or landmark name",
    "country": "string — country",
    "lat": number or null,
    "lng": number or null,
    "culturalContext": "string — 2-3 sentences about the culture, customs, or social dynamics of this place as described in the book",
    "historicalPeriod": "string — the time period in the book when this place is visited/described",
    "readingNote": "string — why this place matters to the book's themes or the reader's journey"
  }
]

Rules:
- Include 4–8 key places mentioned significantly in the book
- If you're confident of lat/lng coordinates, include them; otherwise null
- Return ONLY the JSON array, no markdown, no explanation`;
  }
});
