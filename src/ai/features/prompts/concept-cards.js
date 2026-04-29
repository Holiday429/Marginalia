/* Prompt: concept-cards
   Target panel: Related Concepts
   Output: JSON array of concept objects matching graph.concepts schema
*/
window.AIFeatureRegistry.setPrompt('concept-cards', {
  build(book) {
    const highlights = (book.highlights || []).map(h => `- "${h.quote}" (p.${h.page || '?'})`).join('\n');
    const summary = book.summary || book.insight?.oneLiner || '';

    return `You are a conceptual analyst helping a reader build a personal knowledge graph.

Book: "${book.title}" by ${book.author}
Summary: ${summary}
Reader highlights:
${highlights || '(none)'}
Reader's own conclusion: ${book.insight?.integration || '(none)'}

Identify 4–7 key concepts from this book that are worth adding to a reading knowledge graph.

Return a JSON array where each item has EXACTLY this shape:
[
  {
    "id": "string — kebab-case slug, unique",
    "name": "string — concept name in the book's primary language",
    "aliases": ["string — alternate names or translations"],
    "contextTag": "string — thematic category (e.g. '认知革命', 'Economics', 'Philosophy')",
    "relationType": "string — one of: core-thesis, supports, questions, action-trigger",
    "strength": number between 0.5 and 1.0,
    "description": "string — 2-3 sentence explanation of the concept",
    "readerUnderstanding": "string — written in first person, how a thoughtful reader might internalize this concept (1-2 sentences)"
  }
]

Rules:
- Prefer concepts that recur across the book, not one-off facts
- relationType reflects the concept's role: core-thesis = central argument, questions = challenges assumptions, action-trigger = motivates behavior change
- readerUnderstanding should feel personal and specific, not generic
- Return ONLY the JSON array, no markdown fences, no explanation`;
  }
});
