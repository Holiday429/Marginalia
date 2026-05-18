/* Prompt: reader-identity
   Target: Profile page — Reading Identity section
   Input: user's full library (titles, authors, genres, languages, geo, highlights, reading rhythm)
   Output: JSON with archetype, axes, behaviorProfile, poeticProjection, provenance

   version: 3
*/
import { AIFeatureRegistry } from '../registry.js';

AIFeatureRegistry.setPrompt('reader-identity', {
  version: '3',

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
  "yearScope": "string — current year",
  "generatedAt": "YYYY.MM.DD",
  "version": "3",
  "archetype": {
    "title": "string — a distinctive archetype title, 2–5 words",
    "titleZh": "string — optional Chinese rendering when natural",
    "summary": "string — 1–2 sentences that define the reader's core reading identity",
    "summaryZh": "string — optional Chinese rendering of the summary"
  },
  "axes": [
    {
      "key": "string",
      "label": "string — one side of a reading tension, 1–2 words",
      "opposite": "string — the opposing reading tendency, 1–3 words",
      "score": 0,
      "evidence": ["string", "string"]
    },
    {
      "key": "string",
      "label": "string",
      "opposite": "string",
      "score": 0,
      "evidence": ["string", "string"]
    },
    {
      "key": "string",
      "label": "string",
      "opposite": "string",
      "score": 0,
      "evidence": ["string", "string"]
    },
    {
      "key": "string",
      "label": "string",
      "opposite": "string",
      "score": 0,
      "evidence": ["string", "string"]
    }
  ],
  "behaviorProfile": [
    {
      "key": "string",
      "label": "string — e.g. Pace / Hour / Mood / Voice",
      "value": "string — short named reading tendency",
      "rationale": "string — one sentence grounded in observed reading behavior",
      "signal": "string — short factual evidence line",
      "confidence": 0
    }
  ],
  "poeticProjection": {
    "ifYouWereABook": "string — one vivid literary-object projection",
    "shelfSmell": "string — one short sensory line",
    "readingWeather": "string — one short atmospheric line"
  },
  "provenance": {
    "bookCount": 0,
    "highlightCount": 0,
    "sourceWindow": "string",
    "promptVersion": "3",
    "model": "string"
  }
}

Rules:
- archetype.summary must be specific to this reader's data, not a generic archetype description
- axes must describe interpretable reading tensions, not genres
- axes[].score is an integer 0–100
- behaviorProfile should be 4–6 entries and must stay evidence-driven, not poetic
- poeticProjection is where you may be most lyrical; behaviorProfile is not
- use evidence from actual books, highlights, languages, countries, rhythm, and annotation patterns when available
- provenance.bookCount and provenance.highlightCount must be numeric counts derived from input
- tone: a thoughtful literary editor who has studied the shelf, not an algorithm
- Return ONLY the JSON object`;
  }
});
