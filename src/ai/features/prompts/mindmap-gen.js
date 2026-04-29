/* Prompt: mindmap-gen
   Target panel: Knowledge Structure (mindmap)
   Output: JSON matching the book.mindmap schema used by renderMindmap()
*/
window.AIFeatureRegistry.setPrompt('mindmap-gen', {
  build(book) {
    const highlights = (book.highlights || []).map(h => `- [p.${h.page || '?'}] "${h.quote}"`).join('\n');
    const tags = (book.tags || []).join(', ');

    return `You are a rigorous reading analyst. Analyze the book below and produce a structured knowledge map.

Book: "${book.title}" by ${book.author} (${book.year || 'n.d.'})
Type: ${book.bookType || 'nonfiction'}
Summary: ${book.summary || ''}
Tags: ${tags}
Reader highlights:
${highlights || '(none provided)'}

Return a JSON object with EXACTLY this shape (all fields required):
{
  "title": "string — book title + Knowledge Structure",
  "subtitle": "string — one-line description of the map",
  "timeline": [
    {
      "era": "string — era or period label",
      "items": [
        { "year": "string", "title": "string", "tags": ["string"] }
      ]
    }
  ],
  "revolutions": [
    {
      "id": "string — slug",
      "title": "string",
      "period": "string",
      "thesis": "string — one sentence core claim",
      "branches": [
        { "label": "string", "items": ["string"] }
      ],
      "points": ["string — 2-3 key insights"],
      "chapters": ["string — chapter names if known"]
    }
  ],
  "ideas": [
    { "title": "string", "body": "string — 2-3 sentences" }
  ],
  "happiness": {
    "question": "string — the central human question this book poses",
    "views": [
      { "title": "string", "body": "string" }
    ],
    "verdict": "string — author's nuanced conclusion"
  },
  "futurePaths": [
    { "title": "string", "badge": "string — keywords", "details": ["string"] }
  ]
}

Rules:
- Write timeline items in the language of the book's content (Chinese if Chinese book)
- Keep ideas concise: max 3 sentences each
- revolutions = major structural themes or arguments, not literal revolutions
- futurePaths = implications or open questions the book raises
- Return ONLY the JSON object, no markdown, no explanation`;
  }
});
