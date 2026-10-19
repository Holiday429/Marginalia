// Marginalia · demo library — THE one demo dataset (see docs/optimization-plan.md 1.5).
// Search, Library, Graph, Map, Profile and the notes wall all derive their demo numbers from DEMO_BOOKS.
// Only the signed-out experience ever reads this; signed-in users never see it.

import { asset } from '../../core/asset.ts';
import type { PublicProfileData } from '../../profile/profile-types.ts';
import { DEMO_FEATURED_BOOK } from './featured-book.js';

export interface DemoBook {
  id: string;
  title: string;
  author: string;
  status: 'reading' | 'want' | 'finished';
  spine: string;
  text: string;
  w?: number;
  h?: number;
  font?: string;
  weight?: number;
  finishedAt?: number;
  coverImage?: string;
  genre?: string;
  language?: string;
  tags?: string[];
  geo?: { authorOrigin?: { country: string; city?: string }; contentLocation?: { country: string } };
}

const D = (iso: string) => new Date(iso).getTime();

// Chinese-language reads with covers and geography (feed the Map and Profile demo).
const READ_WITH_COVERS: DemoBook[] = [
  { id: '__demo_huoshan', title: '活山', author: '娜恩·谢泼德 Nan Shepherd', status: 'finished', spine: '#4a5e48', text: '#e8f0d8', finishedAt: D('2025-01-28'), coverImage: asset('covers/huoshan.jpg'), genre: 'Nonfiction', language: 'Chinese', geo: { authorOrigin: { country: 'GB' }, contentLocation: { country: 'GB' } } },
  { id: '__demo_liusudi', title: '流俗地', author: '黎紫书 Zishu Li', status: 'finished', spine: '#5c3a2a', text: '#f5e6c8', finishedAt: D('2025-03-10'), coverImage: asset('covers/liusudi.jpg'), genre: 'Fiction', language: 'Chinese', geo: { authorOrigin: { country: 'MY' }, contentLocation: { country: 'MY' } } },
  { id: '__demo_dongwuzhuangyuan', title: '动物庄园', author: '乔治·奥威尔 George Orwell', status: 'finished', spine: '#2e3b2a', text: '#d6e8c0', finishedAt: D('2025-04-22'), coverImage: asset('covers/dongwuzhuangyuan.jpg'), genre: 'Fiction', language: 'Chinese', geo: { authorOrigin: { country: 'GB' }, contentLocation: { country: 'GB' } } },
  { id: '__demo_shaozhi', title: '烧纸', author: '李沧东 Chang-dong Lee', status: 'finished', spine: '#3b2020', text: '#f0c8a0', finishedAt: D('2025-05-15'), coverImage: asset('covers/shaozhi.jpg'), genre: 'Fiction', language: 'Chinese', geo: { authorOrigin: { country: 'KR' }, contentLocation: { country: 'KR' } } },
  { id: '__demo_jiangshuxi', title: '将熟悉变为陌生', author: '齐格蒙·鲍曼 Zygmunt Bauman', status: 'finished', spine: '#1e2a3a', text: '#c8d8f0', finishedAt: D('2025-06-30'), coverImage: asset('covers/jiangshuxi.jpg'), genre: 'Social science', language: 'Chinese', geo: { authorOrigin: { country: 'PL' }, contentLocation: { country: 'PL' } } },
  { id: '__demo_yunyou', title: '云游', author: '奥尔加·托卡尔丘克 Olga Tokarczuk', status: 'finished', spine: '#2a3548', text: '#d8e4f8', finishedAt: D('2025-07-20'), coverImage: asset('covers/yunyou.jpg'), genre: 'Fiction', language: 'Chinese', geo: { authorOrigin: { country: 'PL' }, contentLocation: { country: 'PL' } } },
  { id: '__demo_meiyjuhua', title: '每一句话语都坐着别的眼睛', author: '赫塔·米勒 Herta Müller', status: 'finished', spine: '#3a2835', text: '#f0d8e8', finishedAt: D('2025-08-18'), coverImage: asset('covers/meiyijuhua.jpg'), genre: 'Fiction', language: 'Chinese', geo: { authorOrigin: { country: 'RO' }, contentLocation: { country: 'RO' } } },
  { id: '__demo_daofeng', title: '刀锋', author: '毛姆 W. Somerset Maugham', status: 'finished', spine: '#2a2215', text: '#f5e8c0', finishedAt: D('2025-10-14'), coverImage: asset('covers/daofeng.jpg'), genre: 'Fiction', language: 'Chinese', geo: { authorOrigin: { country: 'GB' }, contentLocation: { country: 'GB' } } },
  { id: '__demo_pingmianguo', title: '平面国', author: '埃德温·A.艾勃特', status: 'finished', spine: '#1a2238', text: '#c8d4f5', finishedAt: D('2026-01-18'), coverImage: asset('covers/pingmianguo.jpg'), genre: 'Fiction', language: 'Chinese', geo: { authorOrigin: { country: 'GB' }, contentLocation: { country: 'GB' } } },
  { id: '__demo_huozhe', title: '活着', author: '余华', status: 'finished', spine: '#3d2b1f', text: '#e8c97a', finishedAt: D('2026-02-28'), coverImage: asset('covers/huozhe.jpg'), genre: 'Fiction', language: 'Chinese', geo: { authorOrigin: { country: 'CN', city: 'Hangzhou' }, contentLocation: { country: 'CN' } } },
  { id: '__demo_biancheng', title: '边城', author: '沈从文', status: 'finished', spine: '#3b4a2e', text: '#e0f0c8', finishedAt: D('2026-03-22'), coverImage: asset('covers/biancheng.jpg'), genre: 'Fiction', language: 'Chinese', geo: { authorOrigin: { country: 'CN' }, contentLocation: { country: 'CN' } } },
  { id: '__demo_hongloumeng', title: '红楼梦', author: '曹雪芹', status: 'finished', spine: '#6b1a1a', text: '#f5d0b0', finishedAt: D('2026-04-10'), coverImage: asset('covers/hongloumeng.jpg'), genre: 'Fiction', language: 'Chinese', geo: { authorOrigin: { country: 'CN' }, contentLocation: { country: 'CN' } } },
];

// Western classics on the demo shelf (spine styling only).
const SHELF_CLASSICS: DemoBook[] = [
  { id: '__demo_visible-signs', title: 'Visible Signs', author: 'Crow', status: 'reading', spine: '#14263e', text: '#e8dfc8', w: 44, h: 0.95, font: '\'Fraunces\', serif' },
  { id: '__demo_dune', title: 'Dune', author: 'Herbert', status: 'reading', spine: '#c68b4a', text: '#1a1714', w: 48, h: 0.92, font: '\'Bodoni Moda\', serif', weight: 800 },
  { id: '__demo_the-lightness', title: 'The Lightness', author: 'Kundera', status: 'finished', spine: '#7a2f28', text: '#e8dfc8', w: 32, h: 0.88, font: '\'Fraunces\', serif' },
  { id: '__demo_1984', title: '1984', author: 'Orwell', status: 'finished', spine: '#1a1714', text: '#c68b4a', w: 30, h: 0.82, font: '\'Bodoni Moda\', serif', weight: 700 },
  { id: '__demo_gatsby', title: 'Gatsby', author: 'Fitzgerald', status: 'finished', spine: '#8a3f2a', text: '#e8dfc8', w: 34, h: 0.84, font: '\'Fraunces\', serif' },
  { id: '__demo_the-odyssey', title: 'The Odyssey', author: 'Homer', status: 'finished', spine: '#d4c4a0', text: '#2a2018', w: 40, h: 0.94, font: '\'Bodoni Moda\', serif', weight: 600 },
  { id: '__demo_beloved', title: 'Beloved', author: 'Morrison', status: 'finished', spine: '#3d2a20', text: '#d4c4a0', w: 36, h: 0.86, font: '\'Fraunces\', serif' },
  { id: '__demo_invisible-cities', title: 'Invisible Cities', author: 'Calvino', status: 'finished', spine: '#2f4a3a', text: '#d4c4a0', w: 38, h: 0.78, font: '\'Fraunces\', serif' },
  { id: '__demo_middlemarch', title: 'Middlemarch', author: 'Eliot', status: 'finished', spine: '#5c4a2a', text: '#e8dfc8', w: 42, h: 0.98, font: '\'Bodoni Moda\', serif', weight: 500 },
  { id: '__demo_east-of-eden', title: 'East of Eden', author: 'Steinbeck', status: 'finished', spine: '#8f6f2a', text: '#1a1714', w: 46, h: 0.93, font: '\'Fraunces\', serif' },
  { id: '__demo_pale-fire', title: 'Pale Fire', author: 'Nabokov', status: 'finished', spine: '#c94a3a', text: '#f3e8d0', w: 36, h: 0.8, font: '\'Bodoni Moda\', serif', weight: 700 },
  { id: '__demo_on-beauty', title: 'On Beauty', author: 'Smith', status: 'finished', spine: '#b8935a', text: '#1a1714', w: 34, h: 0.84, font: '\'Fraunces\', serif' },
  { id: '__demo_stoner', title: 'Stoner', author: 'Williams', status: 'finished', spine: '#4a3a2a', text: '#d4c4a0', w: 30, h: 0.76, font: '\'Fraunces\', serif' },
  { id: '__demo_a-little-life', title: 'A Little Life', author: 'Yanagihara', status: 'finished', spine: '#8a6a2a', text: '#1a1714', w: 52, h: 0.99, font: '\'Bodoni Moda\', serif', weight: 600 },
  { id: '__demo_the-waves', title: 'The Waves', author: 'Woolf', status: 'finished', spine: '#4a5a6a', text: '#e8dfc8', w: 32, h: 0.82, font: '\'Fraunces\', serif' },
  { id: '__demo_if-on-a-winter', title: 'If on a Winter', author: 'Calvino', status: 'want', spine: '#c4baa8', text: '#1a1714', w: 34, h: 0.78, font: '\'Fraunces\', serif' },
  { id: '__demo_the-name-of-rose', title: 'The Name of Rose', author: 'Eco', status: 'want', spine: '#2a2824', text: '#c68b4a', w: 44, h: 0.96, font: '\'Fraunces\', serif' },
  { id: '__demo_mrs-dalloway', title: 'Mrs Dalloway', author: 'Woolf', status: 'want', spine: '#9a5a4a', text: '#e8dfc8', w: 28, h: 0.74, font: '\'Bodoni Moda\', serif', weight: 500 },
  { id: '__demo_austerlitz', title: 'Austerlitz', author: 'Sebald', status: 'want', spine: '#6a7260', text: '#e8dfc8', w: 36, h: 0.86, font: '\'Fraunces\', serif' },
  { id: '__demo_gravity-s-rainbow', title: 'Gravity\'s Rainbow', author: 'Pynchon', status: 'want', spine: '#c4a890', text: '#1a1714', w: 48, h: 0.97, font: '\'Fraunces\', serif' },
  { id: '__demo_the-magic-mountain', title: 'The Magic Mountain', author: 'Mann', status: 'want', spine: '#1e3a4a', text: '#d4c4a0', w: 46, h: 0.95, font: '\'Bodoni Moda\', serif', weight: 600 },
  { id: '__demo_the-stranger', title: 'The Stranger', author: 'Camus', status: 'want', spine: '#d9cfb9', text: '#1a1714', w: 26, h: 0.72, font: '\'Fraunces\', serif' },
];

/** Store-shaped record (what BooksStore holds), built from a DemoBook. */
function toRecord(b: DemoBook): Record<string, unknown> {
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    status: b.status,
    spine: b.spine,
    text: b.text,
    w: b.w,
    h: b.h,
    font: b.font,
    weight: b.weight,
    genre: b.genre,
    language: b.language,
    finishedAt: b.finishedAt,
    geo: b.geo,
    tags: b.tags ?? [],
    cover: { bg: b.spine, text: b.text, image: b.coverImage ?? '' },
  };
}

/** The whole demo library, in shelf order. Signed-out visitors only. */
export const DEMO_BOOKS: Array<Record<string, any>> = [ // eslint-disable-line @typescript-eslint/no-explicit-any -- store records are loosely typed
  ...SHELF_CLASSICS.filter((b) => b.status === 'reading').map(toRecord),
  DEMO_FEATURED_BOOK,
  ...READ_WITH_COVERS.map(toRecord),
  ...SHELF_CLASSICS.filter((b) => b.status !== 'reading').map(toRecord),
];

export function getDemoBook(id: string): Record<string, any> | undefined { // eslint-disable-line @typescript-eslint/no-explicit-any
  return DEMO_BOOKS.find((b) => b.id === id);
}

/** Headline numbers every demo page must agree on. */
export function demoCounts(): { total: number; finished: number; reading: number; want: number } {
  const status = (b: Record<string, any>) => String(b.status); // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    total: DEMO_BOOKS.length,
    finished: DEMO_BOOKS.filter((b) => status(b) === 'finished').length,
    reading: DEMO_BOOKS.filter((b) => status(b) === 'reading').length,
    want: DEMO_BOOKS.filter((b) => status(b) === 'want').length,
  };
}

/** Highlights of the featured demo book (the only demo book with written notes). */
export const DEMO_HIGHLIGHTS: Array<{ quote: string; bookTitle: string; bookId: string }> =
  ((DEMO_FEATURED_BOOK.highlights ?? []) as Array<{ quote?: string }>)
    .filter((h) => h.quote)
    .map((h) => ({ quote: String(h.quote), bookTitle: DEMO_FEATURED_BOOK.titleZh || DEMO_FEATURED_BOOK.title, bookId: DEMO_FEATURED_BOOK.id }));

export const DEMO_PROFILE: PublicProfileData = {
  uid: '__demo_profile',
  slug: '',
  profilePublic: true,
  displayName: 'Reading Identity Preview',
  bio: 'A profile-stage preview built from the demo shelf.',
  showMap: true,
  showPortrait: false,
  showRhythm: true,
  showDesk: true,
};

export interface DemoSessionDay { date: string; sessions: number; minutes: number; highlights: number }

/** Deterministic reading rhythm around each finished book's finish date. */
export function buildDemoSessionDays(books: Array<{ status?: string; finishedAt?: number }>): DemoSessionDay[] {
  const dayMap = new Map<string, DemoSessionDay>();
  const addDay = (value: number, sessions: number, minutes: number, highlights: number) => {
    const date = new Date(value).toISOString().slice(0, 10);
    const existing = dayMap.get(date) ?? { date, sessions: 0, minutes: 0, highlights: 0 };
    existing.sessions += sessions;
    existing.minutes += minutes;
    existing.highlights += highlights;
    dayMap.set(date, existing);
  };

  books
    .filter((book) => book.status === 'finished' && (book.finishedAt ?? 0) > 0)
    .forEach((book, index) => {
      const anchor = book.finishedAt ?? 0;
      [-10, -7, -4, -2, 0].forEach((offset, offsetIndex) => {
        addDay(anchor + offset * 86400000, 1, 24 + ((index + offsetIndex) % 3) * 12, offsetIndex >= 3 ? 1 : 0);
      });
    });

  return [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
}
