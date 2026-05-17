import { renderUnifiedPanelHeader, renderToolPageShell } from '../core/app.js';
import { logError, logEvent } from '../services/analytics.ts';
import { renderProfileSettings } from './profile-settings.ts';
import { ProfileMap } from './profile-map.ts';
import { ProfileYearInReview } from './profile-year-in-review.ts';
import { MarginaliaAuth } from '../firebase/auth.js';
import { ENV } from '../core/env.ts';
import { BooksStore } from '../store/books-store.ts';
import './profile.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FirestoreDB = any;

interface PublicProfileData {
  displayName: string;
  uid: string;
  slug: string;
  profilePublic: boolean;
  avatarUrl?: string;
  bio?: string;
  showMap?: boolean;
  showPortrait?: boolean;
  showRhythm?: boolean;
  showDesk?: boolean;
}

interface PublicBook {
  id: string;
  title: string;
  author: string;
  spine: string;
  text: string;
  status?: string;
  finishedAt?: number;
  coverSrc?: string;
  geo?: {
    authorOrigin?: { country: string; province?: string; city?: string };
    contentLocation?: { country: string; province?: string; city?: string };
    readerLocation?: { country: string; province?: string; city?: string };
  };
  genre?: string;
  language?: string;
  year?: number;
}

interface PublicHighlight {
  quote: string;
  bookTitle: string;
  bookId?: string;
}

interface SessionDay {
  date: string;
  sessions: number;
  minutes: number;
  highlights: number;
}

interface DemoPayload {
  profile: PublicProfileData;
  books: PublicBook[];
  highlights: PublicHighlight[];
  sessionDays: SessionDay[];
}

const REGION_NAMES = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

const DEMO_BOOKS: PublicBook[] = [
  {
    id: '__demo_cn',
    title: '活着',
    author: '余华',
    spine: '#3d2b1f',
    text: '#e8c97a',
    status: 'read',
    finishedAt: Date.now() - 30 * 86400000,
    genre: 'Fiction',
    language: 'Chinese',
    year: 1993,
    geo: { authorOrigin: { country: 'CN', city: 'Hangzhou' }, contentLocation: { country: 'CN' } },
  },
  {
    id: '__demo_fr',
    title: 'The Little Prince',
    author: 'Antoine de Saint-Exupéry',
    spine: '#4a6741',
    text: '#f2e6c2',
    status: 'read',
    finishedAt: Date.now() - 60 * 86400000,
    genre: 'Fiction',
    language: 'French',
    year: 1943,
    geo: { authorOrigin: { country: 'FR', city: 'Lyon' }, contentLocation: { country: 'FR' } },
  },
  {
    id: '__demo_us',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    spine: '#1c3a5e',
    text: '#f0dfa0',
    status: 'reading',
    finishedAt: 0,
    genre: 'Fiction',
    language: 'English',
    year: 1925,
    geo: { authorOrigin: { country: 'US', city: 'St. Paul' }, contentLocation: { country: 'US' } },
  },
];

const DEMO_PROFILE: PublicProfileData = {
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

export function initProfile(): void {
  return;
}

export async function enterProfile(params: { slug?: string; _settingsOnly?: boolean; _preview?: boolean; _uid?: string } = {}): Promise<void> {
  const container = document.getElementById('panel-profile');
  if (!container) return;
  const showSettingsAction = !params.slug;

  if (params._settingsOnly) {
    container.innerHTML = settingsShellHTML();
    const settingsEl = container.querySelector<HTMLElement>('#profSettingsMount');
    if (settingsEl) await renderProfileSettings(settingsEl);
    bindProfileChrome(container, true);
    return;
  }

  if (!params.slug && !params._uid) {
    const auth = MarginaliaAuth as any;
    const uid: string | null = auth.user?.uid ?? null;
    const db = auth.db;
    if (db && uid) return enterProfile({ _uid: uid, _preview: true });
    const demo = buildDemoPayload();
    renderResolvedProfile(container, demo.profile, demo.books, demo.highlights, demo.sessionDays, false, true);
    logEvent('profile_viewed', { slug: 'demo-preview' });
    return;
  }

  container.innerHTML = loadingShellHTML(showSettingsAction);

  const db = getDb();
  if (!db) {
    container.innerHTML = stateShellHTML('Firebase is not available.', 'This profile cannot load without a database connection.', showSettingsAction);
    return;
  }

  try {
    let profileData: PublicProfileData | null;
    let ownerPreview = false;

    if (params._uid) {
      profileData = await lookupByUid(db, params._uid);
      ownerPreview = true;
    } else {
      profileData = await lookupBySlug(db, params.slug!);
    }

    if (!profileData) {
      container.innerHTML = stateShellHTML('Profile not found', `No reader has claimed ${params.slug ?? 'this handle'} yet.`, showSettingsAction);
      return;
    }

    if (!ownerPreview && !profileData.profilePublic) {
      container.innerHTML = stateShellHTML(profileData.displayName, 'This profile is private.', showSettingsAction);
      return;
    }

    const [books, highlights, sessionDays] = await Promise.all([
      fetchPublicBooks(db, profileData.uid, ownerPreview),
      fetchPublicHighlights(db, profileData.uid, ownerPreview),
      fetchSessions(db, profileData.uid),
    ]);

    const isOwner = ownerPreview;
    renderResolvedProfile(container, profileData, books, highlights, sessionDays, isOwner, showSettingsAction);
    logEvent('profile_viewed', { slug: profileData.slug || 'owner-preview' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(error instanceof Error ? error : new Error(message), { context: 'enterProfile' });
    container.innerHTML = stateShellHTML('Something went wrong', message, showSettingsAction);
  }
}

export function enterPanel_profile(params: { slug?: string } = {}): void {
  enterProfile(params);
}

function getDb(): FirestoreDB | null {
  return (MarginaliaAuth as any).db ?? null;
}

function buildProfileData(uid: string, data: Record<string, any>): PublicProfileData {
  const settings = data.settings ?? {};
  const profileSettings = settings.profileSections ?? {};
  return {
    uid,
    slug: settings.slug ?? '',
    profilePublic: settings.profilePublic ?? false,
    displayName: data.displayName || settings.username || settings.slug || uid,
    avatarUrl: data.avatarUrl ?? undefined,
    bio: settings.bio ?? undefined,
    showMap: profileSettings.map !== false,
    showPortrait: profileSettings.portrait === true,
    showRhythm: profileSettings.rhythm !== false,
    showDesk: profileSettings.desk !== false,
  };
}

async function lookupByUid(db: FirestoreDB, uid: string): Promise<PublicProfileData | null> {
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) return null;
  return buildProfileData(uid, snap.data() as Record<string, any>);
}

async function lookupBySlug(db: FirestoreDB, slug: string): Promise<PublicProfileData | null> {
  const snap = await db.collection('users').where('settings.slug', '==', slug).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return buildProfileData(doc.id, doc.data() as Record<string, any>);
}

async function fetchPublicBooks(db: FirestoreDB, uid: string, ownerPreview = false): Promise<PublicBook[]> {
  const wsId: string = ENV.WORKSPACE_ID || 'default';
  const colRef = db.collection('workspaces').doc(wsId).collection('users').doc(uid).collection('books');
  const snap = await (ownerPreview ? colRef.limit(60).get() : colRef.where('shareInProfile', '==', true).limit(60).get());

  const books = snap.docs
    .map((doc: any) => {
      const data = doc.data() as Record<string, any>;
      const meta = data.meta ?? {};
      const cover = data.cover ?? {};
      const user = data.user ?? {};
      const bookGeo = data.geo ?? {};
      const loc = data.location?.country ?? data.loc ?? null;
      return {
        id: doc.id,
        title: data.title ?? meta.title ?? meta.titleZh ?? 'Untitled',
        author: data.author ?? meta.author ?? meta.authorZh ?? '',
        spine: data.spine ?? cover.bg ?? '#4a4035',
        text: data.text ?? cover.text ?? '#e8dfc8',
        status: normalizeProfileStatus(data.status ?? user.status),
        finishedAt: toTimestamp(data.finishedAt ?? user.finishedAt ?? meta.finishedAt),
        coverSrc: cover.image ?? data.coverSrc ?? undefined,
        genre: meta.genre ?? data.genre ?? undefined,
        language: meta.language ?? data.language ?? undefined,
        year: meta.year ?? data.year ?? undefined,
        geo: {
          authorOrigin: bookGeo.authorOrigin ?? (loc ? { country: loc } : undefined),
          contentLocation: bookGeo.contentLocation ?? (loc ? { country: loc } : undefined),
          readerLocation: bookGeo.readerLocation ?? undefined,
        },
      } as PublicBook;
    })
    .sort((a: PublicBook, b: PublicBook) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));

  if (ownerPreview) {
    const ids = new Set(books.map((book: PublicBook) => book.id));
    return [...books, ...DEMO_BOOKS.filter((book) => !ids.has(book.id))];
  }
  return books;
}

async function fetchPublicHighlights(db: FirestoreDB, uid: string, ownerPreview = false): Promise<PublicHighlight[]> {
  const wsId: string = ENV.WORKSPACE_ID || 'default';
  try {
    if (ownerPreview) {
      const snap = await db.collection('workspaces').doc(wsId).collection('users').doc(uid).collection('highlights').limit(24).get();
      return snap.docs
        .map((doc: any) => {
          const data = doc.data() as Record<string, any>;
          return { quote: data.quote ?? '', bookTitle: data.bookTitle ?? '', bookId: data.bookId ?? undefined };
        })
        .filter((highlight: PublicHighlight) => highlight.quote.length > 0);
    }

    const snap = await db.collectionGroup('highlights').where('uid', '==', uid).where('public', '==', true).limit(24).get();
    return snap.docs
      .map((doc: any) => {
        const data = doc.data() as Record<string, any>;
        return { quote: data.quote ?? '', bookTitle: data.bookTitle ?? '', bookId: data.bookId ?? undefined };
      })
      .filter((highlight: PublicHighlight) => highlight.quote.length > 0);
  } catch {
    return [];
  }
}

async function fetchSessions(db: FirestoreDB, uid: string): Promise<SessionDay[]> {
  const wsId: string = ENV.WORKSPACE_ID || 'default';
  const cutoff = Date.now() - 365 * 4 * 24 * 60 * 60 * 1000;
  try {
    const snap = await db
      .collection('workspaces').doc(wsId)
      .collection('users').doc(uid)
      .collection('sessions')
      .where('startedAt', '>=', cutoff)
      .orderBy('startedAt', 'asc')
      .limit(4000)
      .get();

    const dayMap = new Map<string, SessionDay>();
    snap.docs.forEach((doc: any) => {
      const session = doc.data() as Record<string, any>;
      const date = new Date(session.startedAt).toISOString().slice(0, 10);
      const entry = dayMap.get(date) ?? { date, sessions: 0, minutes: 0, highlights: 0 };
      entry.sessions += 1;
      entry.minutes += Math.round((session.duration ?? 0) / 60);
      entry.highlights += session.highlightCount ?? 0;
      dayMap.set(date, entry);
    });

    return Array.from(dayMap.values());
  } catch {
    return [];
  }
}

function loadingShellHTML(showSettingsAction: boolean): string {
  return renderProfilePageShell(`
    ${profileHeaderHTML(showSettingsAction)}
    <div class="prof-loading-shell">
      <div class="prof-loading" aria-label="Loading profile…"><span class="prof-loading__dot"></span></div>
    </div>
  `);
}

function stateShellHTML(title: string, body: string, showSettingsAction: boolean): string {
  return renderProfilePageShell(`
    ${profileHeaderHTML(showSettingsAction)}
    <div class="prof-shell prof-shell--state">
      <div class="prof-state">
        <p class="prof-state__title">${escapeHtml(title)}</p>
        <p class="prof-state__body">${escapeHtml(body)}</p>
      </div>
    </div>
  `);
}

function settingsShellHTML(): string {
  return renderProfilePageShell(`
    ${renderProfileHeader('profile', {
      rightHTML: '<button class="panel-header-action" id="profileBackToProfileBtn">Back to Profile</button>',
    })}
    <div class="prof-shell prof-shell--settings">
      <div class="prof-shell__inner">
        <div id="profSettingsMount"></div>
      </div>
    </div>
  `);
}

function profileHTML(
  profile: PublicProfileData,
  books: PublicBook[],
  highlights: PublicHighlight[],
  sessionDays: SessionDay[],
  isOwner: boolean,
  showSettingsAction: boolean,
): string {
  const avatar = profile.avatarUrl
    ? `<img class="prof-avatar" src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(profile.displayName)}" loading="lazy">`
    : `<div class="prof-avatar prof-avatar--initials" aria-hidden="true">${escapeHtml((profile.displayName || '?').slice(0, 2).toUpperCase())}</div>`;

  const identityLine = buildIdentityLine(books);
  const currentBook = books.find((book) => isReadingStatus(book.status));

  const header = profileHeaderHTML(showSettingsAction);

  const mapSection = profile.showMap ? `
    <section class="prof-section prof-section--hero" aria-label="Reading journey">
      <div class="prof-section__head prof-section__head--stacked">
        <div>
          <span class="prof-kicker">Reading journey</span>
          <h2 class="prof-section__title prof-section__title--hero">Read across places, arrive one book at a time.</h2>
        </div>
        <div class="prof-map-pills" id="profMapPills">
          <button class="prof-pill is-active" data-dim="journey" type="button">Journey</button>
          <button class="prof-pill" data-dim="contentLocation" type="button">Story</button>
          <button class="prof-pill" data-dim="authorOrigin" type="button">Author</button>
          <button class="prof-pill" data-dim="readerLocation" type="button">Reader</button>
        </div>
      </div>
      <div class="prof-map-wrap">
        <div class="prof-map" id="profMap"></div>
        <div class="prof-map-caption" id="profMapCaption"></div>
      </div>
      <div class="prof-map-rail">
        <div class="prof-map-rail__items" id="profMapRail"></div>
        <button class="prof-map-rail__play" id="profMapPlayBtn" type="button">Play journey</button>
      </div>
    </section>
  ` : '';

  const yearSection = profile.showRhythm ? `
    <section class="prof-section" aria-label="This year">
      <div class="prof-section__head prof-section__head--stacked">
        <div>
          <span class="prof-kicker">This year</span>
          <h2 class="prof-section__title">Reading rhythm and annual shelf</h2>
        </div>
      </div>
      <div id="profYearReview"></div>
    </section>
  ` : '';

  const shelfBooks = books.filter((book) => isFinishedStatus(book.status)).slice(0, 18);
  const shelfSection = shelfBooks.length ? `
    <section class="prof-section" aria-label="Shared shelf">
      <div class="prof-section__head">
        <div>
          <span class="prof-kicker">Shared shelf</span>
          <h2 class="prof-section__title">Recently finished</h2>
        </div>
      </div>
      <div class="prof-shelf-wrap">
        <div class="prof-shelf" id="profShelf">${shelfBooks.map(spineCardHTML).join('')}</div>
      </div>
    </section>
  ` : '';

  const deskHighlights = currentBook ? highlights.filter((highlight) => highlight.bookId === currentBook.id) : [];
  const deskSection = profile.showDesk && currentBook ? `
    <section class="prof-section" aria-label="On the desk">
      <div class="prof-section__head">
        <div>
          <span class="prof-kicker">On the desk</span>
          <h2 class="prof-section__title">Currently reading</h2>
        </div>
      </div>
      <div class="prof-desk" id="profDesk">
        <div class="prof-desk__cover" style="background:${escapeHtml(currentBook.spine)};color:${escapeHtml(currentBook.text)}">
          <span class="prof-desk__cover-title">${escapeHtml(currentBook.title)}</span>
          <span class="prof-desk__cover-author">${escapeHtml(currentBook.author)}</span>
        </div>
        <div class="prof-desk__body">
          <div class="prof-desk__meta">${[currentBook.genre, currentBook.language].filter(Boolean).map((value) => escapeHtml(String(value))).join(' · ')}</div>
          <h3 class="prof-desk__title">${escapeHtml(currentBook.title)}</h3>
          <p class="prof-desk__author">by ${escapeHtml(currentBook.author)}</p>
          ${deskHighlights.length ? `
            <blockquote class="prof-desk__quote">
              <p class="prof-desk__quote-text" id="profDeskQuoteText">${escapeHtml(deskHighlights[0].quote)}</p>
            </blockquote>
            ${deskHighlights.length > 1 ? `
              <div class="prof-desk__quote-nav">
                <button class="prof-desk__quote-btn" id="profDeskPrev" type="button" aria-label="Previous quote">&#8249;</button>
                <button class="prof-desk__quote-btn" id="profDeskNext" type="button" aria-label="Next quote">&#8250;</button>
              </div>
            ` : ''}
          ` : '<p class="prof-empty">No shared highlights from the current book yet.</p>'}
        </div>
      </div>
    </section>
  ` : '';

  const portraitSection = profile.showPortrait ? `
    <section class="prof-section" id="profPortraitSection" data-uid="${escapeHtml(profile.uid)}" aria-label="Reader portrait">
      <div class="prof-section__head">
        <div>
          <span class="prof-kicker">Reader portrait</span>
          <h2 class="prof-section__title">A generated sketch of this reading character</h2>
        </div>
        <span class="prof-section__meta">Refreshed weekly</span>
      </div>
      <div id="profPortraitMount"></div>
    </section>
  ` : '';

  return `
    ${header}
    <div class="prof-shell">
      <div class="prof-shell__inner">
        <header class="prof-identity">
          <div class="prof-identity__media">${avatar}</div>
          <div class="prof-identity__copy">
            <span class="prof-kicker">${isOwner ? 'Reading identity' : 'Shared reading page'}</span>
            <h1 class="prof-name">${escapeHtml(profile.displayName)}</h1>
            ${profile.slug ? `<p class="prof-slug">marginalia.app/#/p/${escapeHtml(profile.slug)}</p>` : ''}
            ${profile.bio ? `<p class="prof-bio">${escapeHtml(profile.bio)}</p>` : ''}
            <p class="prof-identity__line">${escapeHtml(identityLine)}</p>
          </div>
        </header>

        ${mapSection}
        ${yearSection}
        ${shelfSection}
        ${deskSection}
        ${portraitSection}
      </div>
    </div>
  `;
}

function bindProfileChrome(container: HTMLElement, settingsOnly: boolean): void {
  const settingsBtn = container.querySelector<HTMLElement>('#profileHeaderSettingsBtn');
  settingsBtn?.addEventListener('click', () => enterProfile({ _settingsOnly: true }));

  if (settingsOnly) {
    container.querySelector<HTMLElement>('#profileBackToProfileBtn')?.addEventListener('click', () => enterProfile());
  }
}

function bindProfileEvents(
  container: HTMLElement,
  highlights: PublicHighlight[],
  books: PublicBook[],
): void {
  bindMapPills(container);
  bindDeskQuoteNav(container, highlights, books);
}

function bindMapPills(container: HTMLElement): void {
  const pillsEl = container.querySelector<HTMLElement>('#profMapPills');
  if (!pillsEl) return;

  pillsEl.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.prof-pill');
    if (!button) return;
    pillsEl.querySelectorAll('.prof-pill').forEach((pill) => pill.classList.remove('is-active'));
    button.classList.add('is-active');
    const mapEl = container.querySelector<HTMLElement>('#profMap');
    if (mapEl) mapEl.dispatchEvent(new CustomEvent('prof:dim-change', { detail: { dim: button.dataset.dim }, bubbles: false }));
  });
}

function bindDeskQuoteNav(container: HTMLElement, highlights: PublicHighlight[], books: PublicBook[]): void {
  const currentBook = books.find((book) => book.status === 'reading');
  if (!currentBook) return;
  const deskHighlights = highlights.filter((highlight) => highlight.bookId === currentBook.id);
  if (deskHighlights.length <= 1) return;

  let index = 0;
  const textEl = container.querySelector<HTMLElement>('#profDeskQuoteText');
  const prevBtn = container.querySelector<HTMLElement>('#profDeskPrev');
  const nextBtn = container.querySelector<HTMLElement>('#profDeskNext');

  const show = (nextIndex: number) => {
    if (!textEl) return;
    textEl.classList.add('prof-fade');
    window.setTimeout(() => {
      textEl.textContent = deskHighlights[nextIndex].quote;
      textEl.classList.remove('prof-fade');
    }, 170);
  };

  prevBtn?.addEventListener('click', () => {
    index = (index - 1 + deskHighlights.length) % deskHighlights.length;
    show(index);
  });
  nextBtn?.addEventListener('click', () => {
    index = (index + 1) % deskHighlights.length;
    show(index);
  });
}

function mountSections(
  container: HTMLElement,
  books: PublicBook[],
  highlights: PublicHighlight[],
  sessionDays: SessionDay[],
  profile: PublicProfileData,
  isOwner: boolean,
): void {
  if (profile.showMap) {
    const mapEl = container.querySelector<HTMLElement>('#profMap');
    const captionEl = container.querySelector<HTMLElement>('#profMapCaption');
    const railEl = container.querySelector<HTMLElement>('#profMapRail');
    const playBtn = container.querySelector<HTMLButtonElement>('#profMapPlayBtn');
    if (mapEl) {
      const profileMap = new ProfileMap(mapEl, captionEl, railEl, playBtn, books);
      profileMap.mount();
    }
  }

  if (profile.showRhythm) {
    const yearEl = container.querySelector<HTMLElement>('#profYearReview');
    if (yearEl) {
      const review = new ProfileYearInReview({
        host: yearEl,
        books,
        sessionDays,
        allowOpenDetails: isOwner,
      });
      review.mount();
    }
  }

  if (profile.showPortrait) {
    const portraitEl = container.querySelector<HTMLElement>('#profPortraitMount');
    if (portraitEl) renderPortrait(portraitEl, books, highlights);
  }
}

function renderPortrait(container: HTMLElement, _books: PublicBook[], _highlights: PublicHighlight[]): void {
  const db = getDb();
  if (!db) {
    container.innerHTML = portraitLoadingHTML();
    return;
  }

  const section = container.closest<HTMLElement>('#profPortraitSection');
  const uid = section?.dataset.uid;
  if (!uid) {
    container.innerHTML = portraitLoadingHTML();
    return;
  }

  const wsId: string = ENV.WORKSPACE_ID || 'default';
  db.doc(`workspaces/${wsId}/users/${uid}/ai_results/reader-portrait`)
    .get()
    .then((snap: any) => {
      if (!snap.exists) {
        container.innerHTML = '';
        return;
      }
      const data = snap.data() as Record<string, any>;
      const result = data.userEdited ?? data.original;
      if (!result?.narrative) {
        container.innerHTML = '';
        return;
      }
      container.innerHTML = portraitHTML(result);
    })
    .catch(() => {
      container.innerHTML = '';
    });

  container.innerHTML = portraitLoadingHTML();
}

function portraitLoadingHTML(): string {
  return `<p class="prof-portrait--loading">Loading portrait…</p>`;
}

function portraitHTML(result: Record<string, any>): string {
  const breakdowns = result.breakdowns ?? {};
  return `
    <div class="prof-portrait">
      <div class="prof-portrait__narrative">
        <div class="prof-portrait__ai-tag">
          <span class="prof-portrait__pulse" aria-hidden="true"></span>
          Generated portrait${result.promptVersion ? ` · v${escapeHtml(String(result.promptVersion))}` : ''}
        </div>
        <p class="prof-portrait__text">${escapeHtml(result.narrative ?? '')}</p>
        <p class="prof-portrait__version">Refreshed weekly · based on shared books and highlights</p>
      </div>
      <div class="prof-portrait__breakdowns">
        ${renderBreakdownGroup('By genre', breakdowns.genre ?? [])}
        ${renderBreakdownGroup('By era', breakdowns.era ?? [])}
        ${renderBreakdownGroup('Margin themes', breakdowns.theme ?? [])}
      </div>
    </div>
  `;
}

function renderBreakdownGroup(label: string, rows: Array<{ label: string; pct: number }>): string {
  if (!rows.length) return '';
  return `
    <div>
      <p class="prof-portrait__group-label">${escapeHtml(label)}</p>
      ${rows.map((row) => `
        <div class="prof-portrait__bar-row">
          <span class="prof-portrait__bar-label">${escapeHtml(row.label)}</span>
          <div class="prof-portrait__bar-track">
            <div class="prof-portrait__bar-fill" style="width:${Math.round(row.pct)}%"></div>
          </div>
          <span class="prof-portrait__bar-pct">${Math.round(row.pct)}%</span>
        </div>
      `).join('')}
    </div>
  `;
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

function countryName(code: string): string {
  return REGION_NAMES?.of(code) || code;
}

function spineCardHTML(book: PublicBook): string {
  return `
    <div class="prof-spine" style="background:${escapeHtml(book.spine)};color:${escapeHtml(book.text)}" title="${escapeHtml(book.title)} — ${escapeHtml(book.author)}">
      <span class="prof-spine__title">${escapeHtml(book.title)}</span>
      <span class="prof-spine__author">${escapeHtml(book.author)}</span>
    </div>
  `;
}

function renderResolvedProfile(
  container: HTMLElement,
  profileData: PublicProfileData,
  books: PublicBook[],
  highlights: PublicHighlight[],
  sessionDays: SessionDay[],
  isOwner: boolean,
  showSettingsAction: boolean,
): void {
  container.innerHTML = renderProfilePageShell(profileHTML(profileData, books, highlights, sessionDays, isOwner, showSettingsAction));
  bindProfileChrome(container, false);
  bindProfileEvents(container, highlights, books);
  mountSections(container, books, highlights, sessionDays, profileData, isOwner);
}

function profileHeaderHTML(showSettingsAction: boolean): string {
  if (showSettingsAction) return renderProfileHeader('profile');
  return renderProfileHeader('profile', { rightHTML: '<span class="panel-header-spacer" aria-hidden="true"></span>' });
}

function buildDemoPayload(): DemoPayload {
  const sourceBooks = BooksStore.getAll().map((record) => mapStoreBookToPublicBook(record)).filter((book): book is PublicBook => Boolean(book));
  const ids = new Set(sourceBooks.map((book) => book.id));
  const books = [...sourceBooks, ...DEMO_BOOKS.filter((book) => !ids.has(book.id))]
    .map((book) => ({ ...book, status: normalizeProfileStatus(book.status) }))
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));

  const seedHighlights = BooksStore.getAll().flatMap((record: any) => {
    const rawHighlights = Array.isArray(record?.highlights) ? record.highlights : [];
    const title = record?.title ?? record?.meta?.title ?? record?.meta?.titleZh ?? 'Untitled';
    return rawHighlights.slice(0, 2).map((item: any, index: number) => ({
      quote: String(item?.quote ?? '').trim(),
      bookTitle: title,
      bookId: String(record?.id ?? `seed-${index}`),
    }));
  }).filter((item) => item.quote.length > 0);

  const highlights = seedHighlights.length ? seedHighlights : [
    {
      quote: 'Money is the most universal and most efficient system of mutual trust ever devised.',
      bookTitle: 'Sapiens: A Brief History of Humankind',
      bookId: 'sapiens',
    },
    {
      quote: 'And now that you do not have to be perfect, you can be good.',
      bookTitle: 'The Little Prince',
      bookId: '__demo_fr',
    },
    {
      quote: 'So we beat on, boats against the current, borne back ceaselessly into the past.',
      bookTitle: 'The Great Gatsby',
      bookId: '__demo_us',
    },
  ];

  return {
    profile: DEMO_PROFILE,
    books,
    highlights,
    sessionDays: buildDemoSessionDays(books),
  };
}

function mapStoreBookToPublicBook(record: any): PublicBook | null {
  if (!record?.id) return null;
  const meta = record.meta ?? {};
  const cover = record.cover ?? {};
  const user = record.user ?? {};
  const location = record.location ?? {};
  const geo = record.geo ?? {};
  const locCountry = location.country ?? record.loc ?? null;
  return {
    id: String(record.id),
    title: record.title ?? meta.title ?? meta.titleZh ?? 'Untitled',
    author: record.author ?? meta.author ?? meta.authorZh ?? '',
    spine: record.spine ?? cover.bg ?? '#4a4035',
    text: record.text ?? cover.text ?? '#e8dfc8',
    status: normalizeProfileStatus(record.status ?? user.status),
    finishedAt: toTimestamp(record.finishedAt ?? user.finishedAt ?? meta.finishedAt),
    coverSrc: cover.image ?? record.coverSrc ?? undefined,
    genre: meta.genre ?? record.genre ?? undefined,
    language: meta.language ?? record.language ?? undefined,
    year: meta.year ?? record.year ?? undefined,
    geo: {
      authorOrigin: geo.authorOrigin ?? (locCountry ? { country: locCountry, city: location.city } : undefined),
      contentLocation: geo.contentLocation ?? (locCountry ? { country: locCountry, city: location.city } : undefined),
      readerLocation: geo.readerLocation ?? undefined,
    },
  };
}

function buildDemoSessionDays(books: PublicBook[]): SessionDay[] {
  const dayMap = new Map<string, SessionDay>();
  const addDay = (value: number, sessions: number, minutes: number, highlights: number) => {
    const date = new Date(value).toISOString().slice(0, 10);
    const existing = dayMap.get(date) ?? { date, sessions: 0, minutes: 0, highlights: 0 };
    existing.sessions += sessions;
    existing.minutes += minutes;
    existing.highlights += highlights;
    dayMap.set(date, existing);
  };

  books.filter((book) => isFinishedStatus(book.status) && (book.finishedAt ?? 0) > 0).forEach((book, index) => {
    const anchor = book.finishedAt ?? Date.now();
    [-10, -7, -4, -2, 0].forEach((offset, offsetIndex) => {
      addDay(anchor + offset * 86400000, 1, 24 + ((index + offsetIndex) % 3) * 12, offsetIndex >= 3 ? 1 : 0);
    });
  });

  books.filter((book) => isReadingStatus(book.status)).forEach((book, index) => {
    const anchor = Math.max(Date.now() - index * 2 * 86400000, Date.now() - 8 * 86400000);
    [0, -1, -3, -5].forEach((offset) => addDay(anchor + offset * 86400000, 1, 18 + index * 7, offset === 0 ? 1 : 0));
  });

  return [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeProfileStatus(status: unknown): string {
  if (status === 'finished') return 'read';
  if (status === 'reading') return 'reading';
  if (status === 'read') return 'read';
  if (status === 'want' || status === 'to-read') return 'want';
  return String(status ?? '');
}

function isFinishedStatus(status: unknown): boolean {
  return normalizeProfileStatus(status) === 'read';
}

function isReadingStatus(status: unknown): boolean {
  return normalizeProfileStatus(status) === 'reading';
}

function toTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function renderProfileHeader(activeView: string, options: { actionLabel?: string; actionId?: string; rightHTML?: string } = {}): string {
  if (!renderUnifiedPanelHeader) throw new Error('renderUnifiedPanelHeader is not available.');
  const headerRenderer = renderUnifiedPanelHeader as unknown as (view: string, opts?: { actionLabel?: string; actionId?: string; rightHTML?: string }) => string;
  return headerRenderer(activeView, options);
}

function renderProfilePageShell(content: string): string {
  if (!renderToolPageShell) throw new Error('renderToolPageShell is not available.');
  const pageShellRenderer = renderToolPageShell as unknown as (pageType: string, contentHTML?: string) => string;
  return pageShellRenderer('profile', content);
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
