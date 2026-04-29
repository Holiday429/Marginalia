/* Prompt: action-suggest
   Target panel: actions
   Output: JSON array matching book.actions schema
*/
window.AIFeatureRegistry.setPrompt('action-suggest', {
  build(book) {
    const highlights = (book.highlights || []).map(h => `- "${h.quote}"`).join('\n');
    const existing = (book.actions || []).map(a => `- ${a.text}`).join('\n');

    return `You are a personal development coach helping a reader act on what they've read.

Book: "${book.title}" by ${book.author}
Summary: ${book.summary || ''}
Reader's conclusion: ${book.insight?.integration || ''}
Key highlights:
${highlights || '(none)'}
Actions the reader already noted:
${existing || '(none)'}

Suggest 4–6 concrete, specific action items this reader could take based on the book's ideas.

Return a JSON array:
[
  {
    "id": "string — slug like 'a7', 'a8'…",
    "text": "string — specific, actionable task. Not vague advice. Include what to do, how, and optionally when.",
    "status": "todo",
    "tag": "Pending"
  }
]

Rules:
- Actions must be specific enough to actually do — not 'think about X' but 'write a one-page note on X'
- Don't duplicate actions already in the reader's existing list
- Tailor actions to this specific book's themes and the reader's own highlights
- Return ONLY the JSON array`;
  }
});
