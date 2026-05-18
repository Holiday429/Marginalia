import type { PublicBook, PublicHighlight, SessionDay, PublicProfileData } from '../../profile/profile-types.ts';
import { BooksStore } from '../../store/books-store.ts';

export const DEMO_SEED_THRESHOLD = 3;

export const DEMO_BOOKS: PublicBook[] = [
  {
    id: '__demo_huoshan',
    title: '活山',
    author: '娜恩·谢泼德 Nan Shepherd',
    spine: '#4a5e48',
    text: '#e8f0d8',
    status: 'read',
    finishedAt: new Date('2025-01-28').getTime(),
    coverSrc: 'assets/covers/活山.jpg',
    genre: 'Nonfiction',
    language: 'Chinese',
    geo: { authorOrigin: { country: 'GB' }, contentLocation: { country: 'GB' } },
  },
  {
    id: '__demo_liusudi',
    title: '流俗地',
    author: '黎紫书 Zishu Li',
    spine: '#5c3a2a',
    text: '#f5e6c8',
    status: 'read',
    finishedAt: new Date('2025-03-10').getTime(),
    coverSrc: 'assets/covers/流俗地.jpg',
    genre: 'Fiction',
    language: 'Chinese',
    geo: { authorOrigin: { country: 'MY' }, contentLocation: { country: 'MY' } },
  },
  {
    id: '__demo_dongwuzhuangyuan',
    title: '动物庄园',
    author: '乔治·奥威尔 George Orwell',
    spine: '#2e3b2a',
    text: '#d6e8c0',
    status: 'read',
    finishedAt: new Date('2025-04-22').getTime(),
    coverSrc: 'assets/covers/动物庄园.jpg',
    genre: 'Fiction',
    language: 'Chinese',
    geo: { authorOrigin: { country: 'GB' }, contentLocation: { country: 'GB' } },
  },
  {
    id: '__demo_shaozhi',
    title: '烧纸',
    author: '李沧东 Chang-dong Lee',
    spine: '#3b2020',
    text: '#f0c8a0',
    status: 'read',
    finishedAt: new Date('2025-05-15').getTime(),
    coverSrc: 'assets/covers/烧纸.jpg',
    genre: 'Fiction',
    language: 'Chinese',
    geo: { authorOrigin: { country: 'KR' }, contentLocation: { country: 'KR' } },
  },
  {
    id: '__demo_jiangshuxi',
    title: '将熟悉变为陌生',
    author: '齐格蒙·鲍曼 Zygmunt Bauman',
    spine: '#1e2a3a',
    text: '#c8d8f0',
    status: 'read',
    finishedAt: new Date('2025-06-30').getTime(),
    coverSrc: 'assets/covers/将熟悉变为陌生.jpg',
    genre: 'Social science',
    language: 'Chinese',
    geo: { authorOrigin: { country: 'PL' }, contentLocation: { country: 'PL' } },
  },
  {
    id: '__demo_yunyou',
    title: '云游',
    author: '奥尔加·托卡尔丘克 Olga Tokarczuk',
    spine: '#2a3548',
    text: '#d8e4f8',
    status: 'read',
    finishedAt: new Date('2025-07-20').getTime(),
    coverSrc: 'assets/covers/云游.jpg',
    genre: 'Fiction',
    language: 'Chinese',
    geo: { authorOrigin: { country: 'PL' }, contentLocation: { country: 'PL' } },
  },
  {
    id: '__demo_meiyjuhua',
    title: '每一句话语都坐着别的眼睛',
    author: '赫塔·米勒 Herta Müller',
    spine: '#3a2835',
    text: '#f0d8e8',
    status: 'read',
    finishedAt: new Date('2025-08-18').getTime(),
    coverSrc: 'assets/covers/每一句话语都坐着别的眼睛.jpg',
    genre: 'Fiction',
    language: 'Chinese',
    geo: { authorOrigin: { country: 'RO' }, contentLocation: { country: 'RO' } },
  },
  {
    id: '__demo_daofeng',
    title: '刀锋',
    author: '毛姆 W. Somerset Maugham',
    spine: '#2a2215',
    text: '#f5e8c0',
    status: 'read',
    finishedAt: new Date('2025-10-14').getTime(),
    coverSrc: 'assets/covers/刀锋.jpg',
    genre: 'Fiction',
    language: 'Chinese',
    geo: { authorOrigin: { country: 'GB' }, contentLocation: { country: 'GB' } },
  },
  {
    id: '__demo_pingmianguo',
    title: '平面国',
    author: '埃德温·A.艾勃特',
    spine: '#1a2238',
    text: '#c8d4f5',
    status: 'read',
    finishedAt: new Date('2026-01-18').getTime(),
    coverSrc: 'assets/covers/平面国.jpg',
    genre: 'Fiction',
    language: 'Chinese',
    geo: { authorOrigin: { country: 'GB' }, contentLocation: { country: 'GB' } },
  },
  {
    id: '__demo_huozhe',
    title: '活着',
    author: '余华',
    spine: '#3d2b1f',
    text: '#e8c97a',
    status: 'read',
    finishedAt: new Date('2026-02-28').getTime(),
    coverSrc: 'assets/covers/活着.jpg',
    genre: 'Fiction',
    language: 'Chinese',
    geo: { authorOrigin: { country: 'CN', city: 'Hangzhou' }, contentLocation: { country: 'CN' } },
  },
  {
    id: '__demo_biancheng',
    title: '边城',
    author: '沈从文',
    spine: '#3b4a2e',
    text: '#e0f0c8',
    status: 'read',
    finishedAt: new Date('2026-03-22').getTime(),
    coverSrc: 'assets/covers/边城.jpg',
    genre: 'Fiction',
    language: 'Chinese',
    geo: { authorOrigin: { country: 'CN' }, contentLocation: { country: 'CN' } },
  },
  {
    id: '__demo_hongloumeng',
    title: '红楼梦',
    author: '曹雪芹',
    spine: '#6b1a1a',
    text: '#f5d0b0',
    status: 'read',
    finishedAt: new Date('2026-04-10').getTime(),
    coverSrc: 'assets/covers/红楼梦.jpg',
    genre: 'Fiction',
    language: 'Chinese',
    geo: { authorOrigin: { country: 'CN' }, contentLocation: { country: 'CN' } },
  },
];

export const DEMO_PROFILE: PublicProfileData = {
  uid: '__demo_profile',
  slug: '',
  profilePublic: true,
  displayName: 'Reading Identity Preview',
  bio: 'A profile-stage preview built from the current demo shelf.',
  showMap: true,
  showPortrait: false,
  showRhythm: true,
  showDesk: true,
};

export function buildDemoHighlights(): PublicHighlight[] {
  const seedHighlights = BooksStore.getAll().flatMap((record: any) => {
    const rawHighlights = Array.isArray(record?.highlights) ? record.highlights : [];
    const title = record?.title ?? record?.meta?.title ?? record?.meta?.titleZh ?? 'Untitled';
    return rawHighlights.slice(0, 2).map((item: any, index: number) => ({
      quote: String(item?.quote ?? '').trim(),
      bookTitle: title,
      bookId: String(record?.id ?? `seed-${index}`),
    }));
  }).filter((item: PublicHighlight) => item.quote.length > 0);

  if (seedHighlights.length) return seedHighlights;
  return [
    {
      quote: 'Money is the most universal and most efficient system of mutual trust ever devised.',
      bookTitle: 'Sapiens: A Brief History of Humankind',
      bookId: 'sapiens',
    },
    {
      quote: '一切存在皆短暂，但也因此而珍贵。',
      bookTitle: '活山',
      bookId: '__demo_huoshan',
    },
    {
      quote: '人是可以被消灭的，但不能被打败。',
      bookTitle: '刀锋',
      bookId: '__demo_daofeng',
    },
  ];
}

export function buildDemoSessionDays(books: PublicBook[]): SessionDay[] {
  const dayMap = new Map<string, SessionDay>();
  const addDay = (value: number, sessions: number, minutes: number, highlights: number) => {
    const date = new Date(value).toISOString().slice(0, 10);
    const existing = dayMap.get(date) ?? { date, sessions: 0, minutes: 0, highlights: 0 };
    existing.sessions += sessions;
    existing.minutes += minutes;
    existing.highlights += highlights;
    dayMap.set(date, existing);
  };

  books
    .filter((book) => (book.status === 'read' || book.status === 'finished') && (book.finishedAt ?? 0) > 0)
    .forEach((book, index) => {
      const anchor = book.finishedAt ?? Date.now();
      [-10, -7, -4, -2, 0].forEach((offset, offsetIndex) => {
        addDay(anchor + offset * 86400000, 1, 24 + ((index + offsetIndex) % 3) * 12, offsetIndex >= 3 ? 1 : 0);
      });
    });

  return [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
}
