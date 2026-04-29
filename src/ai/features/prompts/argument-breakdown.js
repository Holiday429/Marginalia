/* Prompt: argument-breakdown
   Target panel: concept-cards (shared panel, renders as argument cards)
   Output: JSON array of argument objects
*/
window.AIFeatureRegistry.setPrompt('argument-breakdown', {
  build(book) {
    const highlights = (book.highlights || []).map(h =>
      `- [${h.kind || 'note'}] "${h.quote}" (p.${h.page || '?'})`
    ).join('\n');

    return `You are a critical thinking analyst. Decompose the core arguments of this book.

Book: "${book.title}" by ${book.author}
Summary: ${book.summary || ''}
Reader highlights:
${highlights || '(none)'}

Identify 3–5 major arguments the author makes. For each, assess the evidence and potential critique.

Return a JSON array:
[
  {
    "id": "string — kebab-case slug",
    "name": "string — argument name / thesis statement (short)",
    "aliases": [],
    "contextTag": "string — thematic area",
    "relationType": "core-thesis",
    "strength": number 0.5–1.0 (how central this argument is),
    "description": "string — state the argument clearly: what the author claims and the primary evidence used (3-4 sentences)",
    "readerUnderstanding": "string — one key tension or question this argument raises for a critical reader"
  }
]

Rules:
- Focus on arguments, not summaries — what is the author trying to prove?
- description must include: the claim, the supporting evidence, and any acknowledged limitation
- Return ONLY the JSON array`;
  }
});
