/* Prompt: timeline-gen
   Target panel: mindmap (timeline tab)
   Output: JSON array of timeline groups matching book.mindmap.timeline schema
*/
window.AIFeatureRegistry.setPrompt('timeline-gen', {
  build(book) {
    return `You are a historian and reading analyst. Extract the chronological structure from this book.

Book: "${book.title}" by ${book.author} (${book.year || 'n.d.'})
Type: ${book.bookType || 'nonfiction'}
Summary: ${book.summary || ''}

Build a structured timeline of the key events, periods, or ideas presented in this book — grouped by era or theme.

Return a JSON array of era groups:
[
  {
    "era": "string — era or section label",
    "items": [
      {
        "year": "string — date, period, or relative time (e.g. '7万年前', '1492年', 'Early 20th century')",
        "title": "string — event or development title",
        "tags": ["string — 2-4 keyword tags describing significance"]
      }
    ]
  }
]

Rules:
- Group by meaningful thematic eras, not arbitrary page ranges
- Use the language appropriate to the content (Chinese dates/events in Chinese)
- Each era should have 2–6 items
- tags should capture WHY this moment matters, not just what happened
- Return ONLY the JSON array`;
  }
});
