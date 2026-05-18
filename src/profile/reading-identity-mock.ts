/**
 * Mock fixture for the Reading Identity sections.
 * Step-1 data source — UI runs against this until AI generation is rewired.
 */

export interface IdentityAffinity {
  label: string;
  value: number;
  pair: string;
}

export interface IdentityTrait {
  key: string;
  name: string;
  value: string;
  note: string;
}

export interface IdentityFortune {
  title: string;
  body: string;
}

export interface IdentityShelfBook {
  title: string;
  author: string;
  spine: string;
  cover: string;
}

export interface ReadingIdentityData {
  yearScope: string;
  edition: number;
  generatedAt: string;
  archetype: string;
  archetypeCn: string;
  tagline: string;
  taglineCn: string;
  affinity: IdentityAffinity[];
  traits: IdentityTrait[];
  fortunes: IdentityFortune[];
  shelf: IdentityShelfBook[];
}

/** Alternate archetypes cycled by the "Re-divine" interaction. */
export const IDENTITY_VARIATIONS: Array<Pick<ReadingIdentityData,
  'archetype' | 'archetypeCn' | 'tagline' | 'taglineCn'>> = [
  {
    archetype: 'The Lantern Reader',
    archetypeCn: '夜灯派',
    tagline: 'Reads slowly, at the edges of the day — looking for the one sentence that re-orders the room.',
    taglineCn: '在白日的边缘慢读，寻找一句能重排房间的话。',
  },
  {
    archetype: 'The Border Crosser',
    archetypeCn: '越境者',
    tagline: 'Reads as if home is wherever the story is set — each shelf a passport stamped in nine countries.',
    taglineCn: '把书读成护照，每一格书架都盖着一枚异国的印章。',
  },
  {
    archetype: 'The Slow Tide',
    archetypeCn: '潮汐读者',
    tagline: 'Returns to a book three times before calling it finished — once for plot, once for prose, once for the question.',
    taglineCn: '一本书要读三遍才算读完：一遍为情节，一遍为文字，一遍为它向你提出的问题。',
  },
  {
    archetype: 'The Margin Keeper',
    archetypeCn: '边注收藏者',
    tagline: 'Does not underline — copies the moving passage by hand into the margin, slightly slanted.',
    taglineCn: '从不划线，只把动人的句子斜斜地抄进书页的空白处。',
  },
];

export const READING_IDENTITY_MOCK: ReadingIdentityData = {
  yearScope: '2025',
  edition: 3,
  generatedAt: '2025.11.18',
  ...IDENTITY_VARIATIONS[0],
  affinity: [
    { label: 'Slow burn', value: 84, pair: 'Page-turner' },
    { label: 'Marginalia', value: 72, pair: 'Clean page' },
    { label: 'Re-reader', value: 61, pair: 'Always new' },
    { label: 'Wanderer', value: 78, pair: 'Series loyalist' },
  ],
  traits: [
    { key: 'pace', name: 'Pace', value: 'Andante', note: '23 pages an evening, steady' },
    { key: 'hour', name: 'Hour', value: 'Nocturne', note: '63% of sessions after 22:00' },
    { key: 'mood', name: 'Mood', value: 'Melancholy-curious', note: 'Loves grief that makes room' },
    { key: 'voice', name: 'Voice', value: 'First person, quiet', note: 'Finishes 2× more memoir than fiction' },
    { key: 'length', name: 'Length', value: 'Long form', note: 'Median: 384 pages' },
    { key: 'company', name: 'Company', value: 'Solo reader', note: 'Annotates but rarely highlights' },
  ],
  fortunes: [
    {
      title: 'If you were a book',
      body: 'A slim hardcover, deckle-edged, with a coffee ring on page 14 that you decided to keep.',
    },
    {
      title: 'Your shelf smell',
      body: 'Old paper, a little cedar, the ghost of black tea.',
    },
    {
      title: 'Your reading weather',
      body: 'Overcast afternoon, a window cracked open, one lamp on in a room of three.',
    },
  ],
  shelf: [
    { title: '活山', author: 'Nan Shepherd', spine: '#4a5e48', cover: '#e8f0d8' },
    { title: '流俗地', author: 'Zishu Li', spine: '#5c3a2a', cover: '#f5e6c8' },
    { title: '云游', author: 'Olga Tokarczuk', spine: '#2a3548', cover: '#d8e4f8' },
    { title: '刀锋', author: 'W. S. Maugham', spine: '#2a2215', cover: '#f5e8c0' },
    { title: '边城', author: '沈从文', spine: '#3b4a2e', cover: '#e0f0c8' },
    { title: '红楼梦', author: '曹雪芹', spine: '#6b1a1a', cover: '#f5d0b0' },
    { title: '活着', author: '余华', spine: '#3d2b1f', cover: '#e8c97a' },
  ],
};

/** 52-week page counts for the Rhythm bar chart (alternate streak view). */
export const RHYTHM_MOCK: number[] = Array.from({ length: 52 }, (_, i) => {
  const base = 8 + Math.sin(i / 3.2) * 6 + Math.sin(i / 1.7 + 1) * 4;
  const noise = (Math.sin(i * 7.3) + 1) * 5;
  return Math.max(0, Math.round(base + noise));
});

/** Per-card rotation seeds (deg) so sticky notes sit slightly askew. */
export const TRAIT_ROTATIONS = [-2.4, 1.6, -1.1, 2.2, -1.8, 1.2];
export const FORTUNE_ROTATIONS = [-2.6, 1.8, -1.4];

/** Perturb affinity values ±10 (clamped 35–94) for the Re-divine interaction. */
export function perturbAffinity(affinity: IdentityAffinity[]): IdentityAffinity[] {
  return affinity.map((a) => {
    const delta = Math.round((Math.random() - 0.5) * 20);
    return { ...a, value: Math.max(35, Math.min(94, a.value + delta)) };
  });
}
