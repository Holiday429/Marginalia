/* Snapshots were generated from prompts verified byte-identical to the pre-1.2 client prompts.
   A diff here means the text sent to the model changed — review it deliberately. */
import { describe, it, expect } from 'vitest';
import { AI_FEATURES } from '../../shared/ai-prompts';

const book = {
  title: 'Sapiens', author: 'Harari', year: 2011, bookType: 'nonfiction', summary: 'S', tags: ['a', 'b'],
  highlights: [{ page: 3, quote: 'q1', kind: 'concept' }, { quote: 'q2' }],
  actions: [{ text: 'do x' }], insight: { integration: 'I', oneLiner: 'O' }, mindmap: { timeline: [1] },
};
const library = { books: [{ title: 'T', author: 'A', genre: 'g', language: 'en', year: 1999 }], highlightSample: [{ quote: 'hq' }], rhythmNote: 'r' };

describe('AI prompt text is stable', () => {
  for (const [id, feature] of Object.entries(AI_FEATURES)) {
    it(id, () => {
      const realNow = Date.now;
      Date.now = () => 1700000000000;
      try {
        expect(feature.build({ book, library, notes: 'n' })).toMatchSnapshot();
      } finally {
        Date.now = realNow;
      }
    });
  }
});
