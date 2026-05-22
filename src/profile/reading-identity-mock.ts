/**
 * Mock fixture for the Reading Identity section.
 * UI should render against the same schema that the long-term AI result will use.
 */

import type { ReadingIdentityResult, ReadingIdentityVariant } from './reading-identity-types.ts';

export const READING_IDENTITY_VARIANTS: ReadingIdentityVariant[] = [
  {
    archetype: {
      title: 'The Lantern Reader',
      titleZh: '夜灯派',
      summary: 'Reads slowly, at the edges of the day, looking for the one sentence that re-orders the room.',
      summaryZh: '在白日的边缘慢读，寻找一句能重排房间的话。',
    },
    poeticProjection: {
      ifYouWereABook: 'A slim hardcover, deckle-edged, with a coffee ring on page 14 that you decided to keep.',
      shelfSmell: 'Old paper, a little cedar, the ghost of black tea.',
      readingWeather: 'Overcast afternoon, a window cracked open, one lamp on in a room of three.',
    },
  },
  {
    archetype: {
      title: 'The Border Crosser',
      titleZh: '越境者',
      summary: 'Reads as if home is wherever the story is set; each shelf becomes a passport stamped in several countries.',
      summaryZh: '把书读成护照，每一格书架都盖着一枚异国的印章。',
    },
    poeticProjection: {
      ifYouWereABook: 'A travel-worn clothbound volume, corners softened by transit, full of pencilled place names in the margins.',
      shelfSmell: 'Train wool, dust, hotel soap, and paperbacks opened in unfamiliar light.',
      readingWeather: 'Late arrivals, station glass, a city map folded into the back cover.',
    },
  },
  {
    archetype: {
      title: 'The Slow Tide',
      titleZh: '潮汐读者',
      summary: 'Returns to a book in waves, not to repeat it, but to let it disclose a different room each time.',
      summaryZh: '一本书要反复回去，不是重读原文，而是等它每次露出不同的房间。',
    },
    poeticProjection: {
      ifYouWereABook: 'A linen-bound novel with tide marks of rereading, each return leaving a quieter annotation than the last.',
      shelfSmell: 'Salt, lamp heat, and paper that has been reopened more than once.',
      readingWeather: 'Blue hour by the window, the page revisited before the day is over.',
    },
  },
  {
    archetype: {
      title: 'The Margin Keeper',
      titleZh: '边注收藏者',
      summary: 'Does not mark books to conquer them, but to keep a second conversation alive beside the printed one.',
      summaryZh: '批注不是为了占有，而是为了让书页旁边一直留着第二场对话。',
    },
    poeticProjection: {
      ifYouWereABook: 'A heavily lived-in edition, full of small slanted notes that become half the reason to return.',
      shelfSmell: 'Graphite, tea steam, and pages warmed by the heel of your hand.',
      readingWeather: 'Midnight desk light, the sentence paused just long enough for a note.',
    },
  },
];

export const READING_IDENTITY_MOCK: ReadingIdentityResult = {
  yearScope: '2026',
  generatedAt: '2026.05.18',
  version: '3',
  archetype: READING_IDENTITY_VARIANTS[0].archetype,
  axes: [
    {
      key: 'curiosity',
      label: 'Curiosity',
      opposite: 'Comfort reads',
      score: 82,
      evidence: ['Reaches for unfamiliar subjects', 'Opens books outside known authors'],
    },
    {
      key: 'depth',
      label: 'Depth',
      opposite: 'Skim',
      score: 88,
      evidence: ['Longer dwell time per completed book', 'Higher completion on reflective titles'],
    },
    {
      key: 'diversity',
      label: 'Diversity',
      opposite: 'Single lane',
      score: 74,
      evidence: ['Shelf crosses genre and region', 'No single genre dominates'],
    },
    {
      key: 'exploration',
      label: 'Exploration',
      opposite: 'Homebound',
      score: 78,
      evidence: ['Wide geographic spread', 'Reads across many settings'],
    },
    {
      key: 'consistency',
      label: 'Consistency',
      opposite: 'Sporadic',
      score: 66,
      evidence: ['Steady reading streaks', 'Regular session cadence'],
    },
    {
      key: 'reflection',
      label: 'Reflection',
      opposite: 'Clean page',
      score: 71,
      evidence: ['Frequent note-taking', 'Highlights skew toward reflective passages'],
    },
  ],
  behaviorProfile: [
    {
      key: 'pace',
      label: 'Pace',
      value: 'Andante',
      rationale: '23 pages an evening, steady.',
      signal: 'Median session length stays consistent across the month.',
    },
    {
      key: 'hour',
      label: 'Hour',
      value: 'Nocturne',
      rationale: '63% of sessions happen after 22:00.',
      signal: 'Reading clusters after the day has thinned out.',
    },
    {
      key: 'mood',
      label: 'Mood',
      value: 'Melancholy-curious',
      rationale: 'You keep following books that hold grief open instead of resolving it too quickly.',
      signal: 'Highlights cluster around reflective, inward passages.',
    },
    {
      key: 'voice',
      label: 'Voice',
      value: 'First person, quiet',
      rationale: 'Memoir and interior fiction consistently outrun plot-driven work.',
      signal: 'Finishes 2x more memoir than outward-facing fiction.',
    },
    {
      key: 'length',
      label: 'Length',
      value: 'Long form',
      rationale: 'You settle in once a book has room to unfold.',
      signal: 'Median finished length: 384 pages.',
    },
    {
      key: 'company',
      label: 'Company',
      value: 'Solo reader',
      rationale: 'You annotate for yourself more than for display.',
      signal: 'Dense private notes, sparse share-style highlights.',
    },
  ],
  poeticProjection: READING_IDENTITY_VARIANTS[0].poeticProjection,
  provenance: {
    bookCount: 27,
    highlightCount: 48,
    sourceWindow: 'Last 12 months',
    promptVersion: '3',
    model: 'mock',
  },
};
