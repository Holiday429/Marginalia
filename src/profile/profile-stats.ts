import type { PublicBook, PublicHighlight, SessionDay, ActivityDay } from './profile-types.ts';
import type { PublicProfileData } from './profile-types.ts';

const REGION_NAMES = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

export interface ProfileOverviewStat {
  label: string;
  value: string;
}

export interface ProfileOverview {
  stats: ProfileOverviewStat[];
  journeySummary: string;
  firstFinishedLabel: string | null;
  streakLabel: string;
  streakNote: string;
  statusEyebrow: string;
  statusTitle: string;
  statusBody: string;
}

export interface JourneyOverview {
  cityCount: number;
  countryCount: number;
  continentCount: number;
  topGenres: Array<{ label: string; pct: number; count: number }>;
}

export interface ClosingQuote {
  quote: string;
  source: string;
}

export function normalizeProfileStatus(status: unknown): string {
  if (status === 'finished') return 'read';
  if (status === 'reading') return 'reading';
  if (status === 'read') return 'read';
  if (status === 'want' || status === 'to-read') return 'want';
  return String(status ?? '');
}

export function isFinishedStatus(status: unknown): boolean {
  return normalizeProfileStatus(status) === 'read';
}

export function toTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value !== null && typeof value === 'object') {
    const ts = value as Record<string, unknown>;
    if (typeof ts['toMillis'] === 'function') return (ts['toMillis'] as () => number)();
    if (typeof ts['seconds'] === 'number') return ts['seconds'] * 1000;
  }
  return 0;
}

export function formatInt(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)));
}

export function countryName(code: string): string {
  return REGION_NAMES?.of(code) || code;
}

export function countryContinent(code: string): string | null {
  const continentMap: Record<string, string> = {
    US: 'North America', CA: 'North America', MX: 'North America', GT: 'North America', BZ: 'North America', HN: 'North America', SV: 'North America', NI: 'North America', CR: 'North America', PA: 'North America', CU: 'North America', JM: 'North America', HT: 'North America', DO: 'North America',
    CO: 'South America', VE: 'South America', GY: 'South America', SR: 'South America', EC: 'South America', PE: 'South America', BR: 'South America', BO: 'South America', PY: 'South America', CL: 'South America', AR: 'South America', UY: 'South America',
    PT: 'Europe', ES: 'Europe', FR: 'Europe', GB: 'Europe', IE: 'Europe', NL: 'Europe', BE: 'Europe', LU: 'Europe', CH: 'Europe', DE: 'Europe', AT: 'Europe', DK: 'Europe', SE: 'Europe', NO: 'Europe', FI: 'Europe', IT: 'Europe', GR: 'Europe', AL: 'Europe', RS: 'Europe', HR: 'Europe', BA: 'Europe', SI: 'Europe', ME: 'Europe', MK: 'Europe', BG: 'Europe', RO: 'Europe', PL: 'Europe', CZ: 'Europe', SK: 'Europe', HU: 'Europe', UA: 'Europe', BY: 'Europe', MD: 'Europe', LT: 'Europe', LV: 'Europe', EE: 'Europe',
    RU: 'Asia', KZ: 'Asia', UZ: 'Asia', TM: 'Asia', KG: 'Asia', TJ: 'Asia', AF: 'Asia', TR: 'Asia', SY: 'Asia', LB: 'Asia', IL: 'Asia', JO: 'Asia', IQ: 'Asia', IR: 'Asia', SA: 'Asia', YE: 'Asia', OM: 'Asia', AE: 'Asia', QA: 'Asia', KW: 'Asia', BH: 'Asia', PK: 'Asia', IN: 'Asia', BD: 'Asia', NP: 'Asia', LK: 'Asia', MM: 'Asia', TH: 'Asia', VN: 'Asia', KH: 'Asia', LA: 'Asia', MY: 'Asia', SG: 'Asia', ID: 'Asia', PH: 'Asia', TL: 'Asia', CN: 'Asia', MN: 'Asia', KP: 'Asia', KR: 'Asia', JP: 'Asia', TW: 'Asia',
    NG: 'Africa', GH: 'Africa', CI: 'Africa', SN: 'Africa', ML: 'Africa', BF: 'Africa', NE: 'Africa', CM: 'Africa', TD: 'Africa', SD: 'Africa', SS: 'Africa', ET: 'Africa', SO: 'Africa', KE: 'Africa', TZ: 'Africa', UG: 'Africa', RW: 'Africa', BI: 'Africa', CD: 'Africa', CG: 'Africa', GA: 'Africa', AO: 'Africa', ZM: 'Africa', ZW: 'Africa', MZ: 'Africa', MW: 'Africa', MG: 'Africa', ZA: 'Africa', NA: 'Africa', BW: 'Africa', LS: 'Africa', SZ: 'Africa', MA: 'Africa', DZ: 'Africa', TN: 'Africa', LY: 'Africa', EG: 'Africa', MR: 'Africa',
    AU: 'Oceania', NZ: 'Oceania', PG: 'Oceania', FJ: 'Oceania',
  };
  return continentMap[code] ?? null;
}

export function computeCurrentStreak(activityDays: ActivityDay[]): number {
  const sorted = [...new Set(activityDays.map((d) => d.date))].sort();
  if (!sorted.length) return 0;
  // Check if the most recent day is today or yesterday (streak still live)
  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const last = sorted[sorted.length - 1];
  if (last !== todayStr && last !== yesterdayStr) return 0;
  let streak = 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    const curr = new Date(`${sorted[i]}T00:00:00Z`).getTime();
    const prev = new Date(`${sorted[i - 1]}T00:00:00Z`).getTime();
    if (curr - prev === 86400000) streak += 1;
    else break;
  }
  return streak;
}

export function computeLongestStreak(activityDays: ActivityDay[]): number {
  const sorted = [...new Set(activityDays.map((d) => d.date))].sort();
  if (!sorted.length) return 0;
  let best = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00Z`).getTime();
    const next = new Date(`${sorted[i]}T00:00:00Z`).getTime();
    if (next - prev === 86400000) current += 1;
    else current = 1;
    if (current > best) best = current;
  }
  return best;
}

function buildIdentityLine(books: PublicBook[]): string {
  const readBooks = books.filter((book) => isFinishedStatus(book.status));
  if (!readBooks.length) return 'The reading journey is still gathering its first completed arrivals.';

  const countryCounts = new Map<string, number>();
  const languages = new Set<string>();
  readBooks.forEach((book) => {
    const country = book.geo?.contentLocation?.country || book.geo?.authorOrigin?.country || book.geo?.readerLocation?.country;
    if (country) countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
    if (book.language) languages.add(book.language);
  });

  const topCountries = [...countryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([country]) => countryName(country));

  const languageList = [...languages].slice(0, 3);
  const countryPhrase = topCountries.length ? `Arriving through ${topCountries.join(', ')}` : 'Following books across different places';
  const languagePhrase = languageList.length ? `read in ${languageList.join(', ')}` : 'across multiple reading moods';
  return `${countryPhrase}, ${languagePhrase}.`;
}

export function buildJourneyOverview(books: PublicBook[]): JourneyOverview {
  const citySet = new Set<string>();
  const countrySet = new Set<string>();
  const continentSet = new Set<string>();
  const genreCounts = new Map<string, number>();

  books
    .filter((book) => isFinishedStatus(book.status))
    .forEach((book) => {
      [book.geo?.authorOrigin, book.geo?.contentLocation, book.geo?.readerLocation].forEach((geo) => {
        if (!geo?.country) return;
        countrySet.add(geo.country);
        const continent = countryContinent(geo.country);
        if (continent) continentSet.add(continent);
        if (geo.city) citySet.add(`${geo.country}:${geo.city.trim().toLowerCase()}`);
      });
      if (book.genre) genreCounts.set(book.genre, (genreCounts.get(book.genre) ?? 0) + 1);
    });

  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const totalGenres = topGenres.reduce((sum, [, count]) => sum + count, 0) || 1;

  return {
    cityCount: citySet.size,
    countryCount: countrySet.size,
    continentCount: continentSet.size,
    topGenres: topGenres.map(([label, count]) => ({
      label,
      count,
      pct: Math.max(12, Math.round((count / totalGenres) * 100)),
    })),
  };
}

export function buildProfileOverview(
  profile: PublicProfileData,
  books: PublicBook[],
  highlights: PublicHighlight[],
  activityDays: ActivityDay[],
  notesCount: number,
  actionsDoneCount: number,
  isOwner: boolean,
): ProfileOverview {
  const finishedBooks = books.filter((book) => isFinishedStatus(book.status));
  const currentStreak = computeCurrentStreak(activityDays);
  const longestStreak = computeLongestStreak(activityDays);
  const firstFinishedAt = finishedBooks
    .map((book) => book.finishedAt ?? 0)
    .filter((stamp) => stamp > 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const firstFinishedLabel = firstFinishedAt
    ? new Date(firstFinishedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;
  const hasIdentity = finishedBooks.length >= 3;
  const hasQuote = highlights.length > 0;
  const fmt = (n: number): string => (n > 0 ? formatInt(n) : '–');
  const streakValue = currentStreak > 0 ? currentStreak : longestStreak;
  const streakLabel = currentStreak > 0 ? 'Current Streak' : 'Longest Streak';
  const stats: ProfileOverviewStat[] = [
    { label: 'Books Finished', value: fmt(finishedBooks.length) },
    { label: 'Notes Created', value: fmt(notesCount) },
    { label: 'Actions Done', value: fmt(actionsDoneCount) },
    { label: streakLabel, value: fmt(streakValue) },
  ];
  const statusEyebrow = isOwner ? 'Profile Studio' : 'Public Profile';
  let statusTitle = 'Reading portrait in progress';
  let statusBody = 'Keep sharing finished books to unlock a fuller reading identity.';
  if (hasIdentity && hasQuote) {
    statusTitle = profile.profilePublic ? 'Ready to share' : 'Ready when you are';
    statusBody = profile.profilePublic
      ? 'Identity, journey, and annual shelf are staged for public sharing.'
      : 'The profile has enough shape to publish as a public reading card.';
  } else if (hasIdentity) {
    statusTitle = 'Identity assembled';
    statusBody = 'A fuller public profile will feel stronger once highlights and shelf details are present.';
  }

  return {
    stats,
    journeySummary: buildIdentityLine(books),
    firstFinishedLabel,
    streakLabel: streakLabel,
    streakNote: currentStreak > 0 ? `${currentStreak} days and still going` : `${Math.max(1, longestStreak)} days at full glow`,
    statusEyebrow,
    statusTitle,
    statusBody,
  };
}

export function buildClosingQuote(highlights: PublicHighlight[], books: PublicBook[]): ClosingQuote | null {
  const bestHighlight = [...highlights]
    .filter((item) => item.quote.trim().length > 0)
    .sort((a, b) => b.quote.length - a.quote.length)[0];
  if (bestHighlight) {
    return {
      quote: bestHighlight.quote.trim(),
      source: bestHighlight.bookTitle || 'Shared highlight',
    };
  }
  const featuredBook = books.filter((book) => isFinishedStatus(book.status))[0];
  if (!featuredBook) return null;
  return {
    quote: buildIdentityLine(books),
    source: featuredBook.title,
  };
}

export function buildProfileContext(profile: PublicProfileData): { location: string | null; joinedLabel: string | null } {
  const location = profile.location ?? null;
  const joinedLabel = profile.joinedAt
    ? new Date(profile.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;
  return { location, joinedLabel };
}
