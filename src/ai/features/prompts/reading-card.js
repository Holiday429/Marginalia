import { AIFeatureRegistry } from '../registry.ts';

AIFeatureRegistry.setPrompt('reading-card', {
  version: '1.0',
  build(book, extras = {}) {
    const highlights = extras.highlights || [];
    const hl = highlights.slice(0, 5).map(h => `"${h.quote}"`).join('\n');
    return `You are creating a reading card for "${book.title}" by ${book.author || 'unknown'}.

The reader's highlights:
${hl || '(none)'}

Write ONE sentence (max 20 words) that captures what makes this book worth reading. Make it feel like a personal recommendation from someone who just finished it — not a blurb. Return JSON: { "oneliner": "<the sentence>", "mood": "<one word: meditative|provocative|illuminating|grounding|expansive>" }`;
  },
});
