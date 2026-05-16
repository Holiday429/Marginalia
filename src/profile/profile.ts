/* Marginalia · Public Profile View
   Route: #/p/{slug}
   No auth required to view. Reads public Firestore data via slug lookup.

   Layout: display name, public spine cards, reading stats,
   one rotating public highlight quote.
   Typography and color: tokens only — no raw hex, no system sans-serif.
*/

import { logError, logEvent } from '../services/analytics.ts';
import { renderProfileSettings } from './profile-settings.ts';
import { ProfileMap } from './profile-map.ts';
import { ProfileHeatmap } from './profile-heatmap.ts';
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
  // Section visibility toggles (owner-controlled)
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
  // Geographic data for the journey map
  geo?: {
    authorOrigin?: { country: string; province?: string; city?: string };
    contentLocation?: { country: string; province?: string; city?: string };
    readerLocation?: { country: string; province?: string; city?: string };
  };
  // For Reader Portrait breakdowns
  genre?: string;
  language?: string;
  year?: number;
}

interface PublicHighlight {
  quote: string;
  bookTitle: string;
  bookId?: string;
}

// One data point per day for the heatmap
interface SessionDay {
  date: string;       // 'YYYY-MM-DD'
  sessions: number;
  minutes: number;
  highlights: number;
}

interface PublicStats {
  totalBooks: number;
  readBooks: number;
  readingBooks: number;
  countries: number;
  languages: number;
}

let _initialized = false;
let _rotateTimer: ReturnType<typeof setInterval> | null = null;

export function initProfile(): void {
  _initialized = false;
}

export async function enterProfile(params: { slug?: string } = {}): Promise<void> {
  const container = document.getElementById('panel-profile');
  if (!container) return;

  // Settings mode: no slug → show settings for the signed-in user
  if (!params.slug) {
    container.innerHTML = settingsShellHTML();
    const settingsEl = container.querySelector<HTMLElement>('#profSettingsMount');
    if (settingsEl) await renderProfileSettings(settingsEl);
    return;
  }

  if (_rotateTimer) { clearInterval(_rotateTimer); _rotateTimer = null; }

  container.innerHTML = loadingHTML();

  const db = getDb();
  if (!db) {
    container.innerHTML = errorHTML('Firebase is not available.');
    return;
  }

  try {
    const profileData = await lookupBySlug(db, params.slug);
    if (!profileData) {
      container.innerHTML = notFoundHTML(params.slug);
      return;
    }
    if (!profileData.profilePublic) {
      container.innerHTML = privateHTML(profileData.displayName);
      return;
    }

    const [books, highlights] = await Promise.all([
      fetchPublicBooks(db, profileData.uid),
      fetchPublicHighlights(db, profileData.uid),
    ]);
    const [stats, sessionDays] = await Promise.all([
      fetchStats(db, profileData.uid, books),
      fetchSessions(db, profileData.uid),
    ]);

    container.innerHTML = profileHTML(profileData, books, highlights, stats, sessionDays);
    bindProfileEvents(container, highlights, books);
    mountSections(container, books, highlights, sessionDays, profileData);
    logEvent('profile_viewed', { slug: params.slug });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(err instanceof Error ? err : new Error(msg), { context: 'enterProfile' });
    container.innerHTML = errorHTML(msg);
  }
}

export function enterPanel_profile(params: { slug?: string } = {}): void {
  enterProfile(params);
}

// ── Firestore helpers ─────────────────────────────────────────────────────────

function getDb(): FirestoreDB | null {
  return (window as any).MarginaliaAuth?.db ?? null;
}

async function lookupBySlug(db: FirestoreDB, slug: string): Promise<PublicProfileData | null> {
  const snap = await db
    .collection('users')
    .where('settings.slug', '==', slug)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc = snap.docs[0];
  const data = doc.data() as Record<string, any>;
  const settings = data.settings ?? {};

  const profileSettings = settings.profileSections ?? {};
  return {
    uid:           doc.id,
    slug:          settings.slug ?? slug,
    profilePublic: settings.profilePublic ?? false,
    displayName:   data.displayName || settings.username || slug,
    avatarUrl:     data.avatarUrl ?? undefined,
    bio:           settings.bio ?? undefined,
    showMap:       profileSettings.map     !== false,
    showPortrait:  profileSettings.portrait === true,   // off by default
    showRhythm:    profileSettings.rhythm  !== false,
    showDesk:      profileSettings.desk    !== false,
  };
}

async function fetchPublicBooks(db: FirestoreDB, uid: string): Promise<PublicBook[]> {
  const wsId: string = (window as any).MARGINALIA_FIREBASE?.workspaceId ?? 'default';
  const snap = await db
    .collection(`workspaces/${wsId}/users/${uid}/books`)
    .where('shareInProfile', '==', true)
    .limit(40)
    .get();

  return snap.docs
    .map((doc: any) => {
      const d    = doc.data() as Record<string, any>;
      const meta  = d.meta  ?? {};
      const cover = d.cover ?? {};
      const user  = d.user  ?? {};
      const bookGeo = d.geo ?? {};
      const loc = d.location?.country ?? d.loc ?? null;
      return {
        id:         doc.id,
        title:      d.title  ?? meta.title  ?? meta.titleZh  ?? 'Untitled',
        author:     d.author ?? meta.author ?? meta.authorZh ?? '',
        spine:      d.spine  ?? cover.bg    ?? '#4a4035',
        text:       d.text   ?? cover.text  ?? '#e8dfc8',
        status:     d.status ?? user.status,
        finishedAt: d.finishedAt ?? user.finishedAt ?? 0,
        genre:      meta.genre   ?? d.genre  ?? undefined,
        language:   meta.language ?? d.language ?? undefined,
        year:       meta.year    ?? d.year   ?? undefined,
        geo: {
          authorOrigin:    bookGeo.authorOrigin    ?? (loc ? { country: loc } : undefined),
          contentLocation: bookGeo.contentLocation ?? (loc ? { country: loc } : undefined),
          readerLocation:  bookGeo.readerLocation  ?? undefined,
        },
      };
    })
    .sort((a: PublicBook, b: PublicBook) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
}

async function fetchPublicHighlights(db: FirestoreDB, uid: string): Promise<PublicHighlight[]> {
  const wsId: string = (window as any).MARGINALIA_FIREBASE?.workspaceId ?? 'default';
  try {
    const snap = await db
      .collectionGroup('highlights')
      .where('uid', '==', uid)
      .where('public', '==', true)
      .limit(20)
      .get();

    return snap.docs.map((doc: any) => {
      const d = doc.data() as Record<string, any>;
      return { quote: d.quote ?? '', bookTitle: d.bookTitle ?? '', bookId: d.bookId ?? undefined };
    }).filter((h: PublicHighlight) => h.quote.length > 0);
  } catch {
    // CollectionGroup query may fail if index not yet built; degrade gracefully.
    return [];
  }
}

async function fetchStats(db: FirestoreDB, uid: string, books: PublicBook[]): Promise<PublicStats> {
  const wsId: string = (window as any).MARGINALIA_FIREBASE?.workspaceId ?? 'default';
  try {
    const snap = await db
      .collection(`workspaces/${wsId}/users/${uid}/books`)
      .get();
    const allBooks = snap.docs.map((d: any) => d.data());
    const totalBooks   = snap.size;
    const readBooks    = allBooks.filter((d: any) => (d.status ?? d.user?.status) === 'read').length;
    const readingBooks = allBooks.filter((d: any) => (d.status ?? d.user?.status) === 'reading').length;

    // Count unique countries and languages from the public books subset
    const countrySet = new Set<string>();
    const langSet    = new Set<string>();
    books.forEach(b => {
      const ao = b.geo?.authorOrigin?.country;
      if (ao) countrySet.add(ao);
      if (b.language) langSet.add(b.language);
    });

    return { totalBooks, readBooks, readingBooks, countries: countrySet.size, languages: langSet.size };
  } catch {
    return { totalBooks: 0, readBooks: 0, readingBooks: 0, countries: 0, languages: 0 };
  }
}

async function fetchSessions(db: FirestoreDB, uid: string): Promise<SessionDay[]> {
  const wsId: string = (window as any).MARGINALIA_FIREBASE?.workspaceId ?? 'default';
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000; // 52 weeks back
  try {
    const snap = await db
      .collection(`workspaces/${wsId}/users/${uid}/sessions`)
      .where('startedAt', '>=', cutoff)
      .orderBy('startedAt', 'asc')
      .limit(2000)
      .get();

    // Aggregate per calendar day
    const dayMap = new Map<string, SessionDay>();
    snap.docs.forEach((doc: any) => {
      const s = doc.data() as Record<string, any>;
      const date = new Date(s.startedAt).toISOString().slice(0, 10);
      const entry = dayMap.get(date) ?? { date, sessions: 0, minutes: 0, highlights: 0 };
      entry.sessions   += 1;
      entry.minutes    += Math.round((s.duration ?? 0) / 60);
      entry.highlights += s.highlightCount ?? 0;
      dayMap.set(date, entry);
    });

    return Array.from(dayMap.values());
  } catch {
    return [];
  }
}

// ── HTML templates ────────────────────────────────────────────────────────────

function loadingHTML(): string {
  return `<div class="prof-loading" aria-label="Loading profile…"><span class="prof-loading__dot"></span></div>`;
}

function notFoundHTML(slug: string): string {
  return `
    <div class="prof-state">
      <p class="prof-state__title">Profile not found</p>
      <p class="prof-state__body">No reader has claimed the handle <strong>${escapeHtml(slug)}</strong> yet.</p>
      <a class="prof-state__link" href="#search">Back to search</a>
    </div>
  `;
}

function privateHTML(name: string): string {
  return `
    <div class="prof-state">
      <p class="prof-state__title">${escapeHtml(name)}</p>
      <p class="prof-state__body">This profile is private.</p>
      <a class="prof-state__link" href="#search">Back to search</a>
    </div>
  `;
}

function errorHTML(msg: string): string {
  return `
    <div class="prof-state">
      <p class="prof-state__title">Something went wrong</p>
      <p class="prof-state__body">${escapeHtml(msg)}</p>
    </div>
  `;
}

function settingsShellHTML(): string {
  return `
    <div class="prof-shell prof-shell--settings">
      <div class="prof-shell__inner">
        <div id="profSettingsMount"></div>
      </div>
    </div>
  `;
}

function profileHTML(
  profile: PublicProfileData,
  books: PublicBook[],
  highlights: PublicHighlight[],
  stats: PublicStats,
  sessionDays: SessionDay[],
): string {
  const initials = (profile.displayName || '?').slice(0, 2).toUpperCase();
  const avatarEl = profile.avatarUrl
    ? `<img class="prof-avatar" src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(profile.displayName)}" loading="lazy">`
    : `<div class="prof-avatar prof-avatar--initials" aria-hidden="true">${escapeHtml(initials)}</div>`;

  const bioEl = profile.bio
    ? `<p class="prof-bio">${escapeHtml(profile.bio)}</p>`
    : '';

  const statsEl = `
    <div class="prof-stats">
      <span class="prof-stat"><span class="prof-stat__num">${stats.readBooks}</span><span class="prof-stat__label">books read</span></span>
      ${stats.countries > 0 ? `<span class="prof-stat"><span class="prof-stat__num">${stats.countries}</span><span class="prof-stat__label">countries</span></span>` : ''}
      ${stats.languages > 0 ? `<span class="prof-stat"><span class="prof-stat__num">${stats.languages}</span><span class="prof-stat__label">languages</span></span>` : ''}
    </div>`;

  // ── Section: Reading Journey Map ──────────────────────────────────────────
  const mapSection = profile.showMap && books.some(b => b.geo?.authorOrigin || b.geo?.contentLocation)
    ? `<section class="prof-section" id="profMapSection" aria-label="Reading journey">
        <div class="prof-section__head">
          <h2 class="prof-section__title">The Reading Journey</h2>
          <div class="prof-map-pills" id="profMapPills">
            <button class="prof-pill is-active" data-dim="authorOrigin" type="button">Author origin</button>
            <button class="prof-pill" data-dim="contentLocation" type="button">Story location</button>
            <button class="prof-pill" data-dim="readerLocation" type="button">Where I read it</button>
          </div>
        </div>
        <div class="prof-map-wrap">
          <div class="prof-map" id="profMap"></div>
          <div class="prof-map-caption" id="profMapCaption" hidden></div>
        </div>
      </section>`
    : '';

  // ── Section: The Shelf ────────────────────────────────────────────────────
  const readBooks  = books.filter(b => b.status === 'read');
  const thisYear   = new Date().getFullYear();
  const yearBooks  = readBooks.filter(b => b.finishedAt && new Date(b.finishedAt).getFullYear() === thisYear);

  const shelfSection = books.length
    ? `<section class="prof-section" id="profShelfSection" aria-label="Bookshelf">
        <div class="prof-section__head">
          <h2 class="prof-section__title">The Shelf</h2>
          <div class="prof-shelf-tabs" id="profShelfTabs">
            <button class="prof-tab is-active" data-tab="recent" type="button">Recently finished</button>
            <button class="prof-tab" data-tab="year" type="button">${thisYear}</button>
            <button class="prof-tab" data-tab="all" type="button">All</button>
          </div>
        </div>
        <div class="prof-shelf-wrap">
          <div class="prof-shelf" id="profShelf" data-books="${escapeHtml(JSON.stringify(books.map(b => ({ id: b.id, title: b.title, author: b.author, spine: b.spine, text: b.text, status: b.status, finishedAt: b.finishedAt }))))}" ></div>
        </div>
      </section>`
    : '';

  // ── Section: Reader Portrait ──────────────────────────────────────────────
  const portraitSection = profile.showPortrait
    ? `<section class="prof-section" id="profPortraitSection" data-uid="${escapeHtml(profile.uid)}" aria-label="Reader portrait">
        <div class="prof-section__head">
          <h2 class="prof-section__title">Reader Portrait</h2>
          <span class="prof-section__meta">Generated by Marginalia · refreshed weekly</span>
        </div>
        <div id="profPortraitMount"></div>
      </section>`
    : '';

  // ── Section: Reading Rhythm ───────────────────────────────────────────────
  const rhythmSection = profile.showRhythm && sessionDays.length > 0
    ? `<section class="prof-section" id="profRhythmSection" aria-label="Reading rhythm">
        <div class="prof-section__head">
          <h2 class="prof-section__title">Reading Rhythm</h2>
          <div class="prof-heatmap-tabs" id="profHeatmapTabs">
            <button class="prof-tab is-active" data-dim="sessions" type="button">Sessions</button>
            <button class="prof-tab" data-dim="minutes" type="button">Minutes</button>
            <button class="prof-tab" data-dim="highlights" type="button">Highlights</button>
          </div>
        </div>
        <div class="prof-heatmap-wrap">
          <div class="prof-heatmap" id="profHeatmap"
               data-days="${escapeHtml(JSON.stringify(sessionDays))}"></div>
        </div>
      </section>`
    : '';

  // ── Section: On the Desk ─────────────────────────────────────────────────
  const currentBook = books.find(b => b.status === 'reading');
  const deskHighlights = currentBook
    ? highlights.filter(h => h.bookId === currentBook.id)
    : [];
  const deskSection = profile.showDesk && currentBook
    ? `<section class="prof-section" id="profDeskSection" aria-label="Currently reading">
        <div class="prof-section__head">
          <h2 class="prof-section__title">On the Desk</h2>
        </div>
        <div class="prof-desk" id="profDesk">
          <div class="prof-desk__cover" style="background:${escapeHtml(currentBook.spine)};color:${escapeHtml(currentBook.text)}">
            <span class="prof-desk__cover-title">${escapeHtml(currentBook.title)}</span>
            <span class="prof-desk__cover-author">${escapeHtml(currentBook.author)}</span>
          </div>
          <div class="prof-desk__body">
            <div class="prof-desk__meta">${currentBook.genre ? escapeHtml(currentBook.genre) : ''}${currentBook.language ? ` · ${escapeHtml(currentBook.language)}` : ''}</div>
            <h3 class="prof-desk__title">${escapeHtml(currentBook.title)}</h3>
            <p class="prof-desk__author">by ${escapeHtml(currentBook.author)}</p>
            ${deskHighlights.length ? `
              <blockquote class="prof-desk__quote" id="profDeskQuote">
                <p class="prof-desk__quote-text" id="profDeskQuoteText">${escapeHtml(deskHighlights[0].quote)}</p>
              </blockquote>
              ${deskHighlights.length > 1 ? `
                <div class="prof-desk__quote-nav">
                  <button class="prof-desk__quote-btn" id="profDeskPrev" type="button" aria-label="Previous quote">&#8249;</button>
                  <button class="prof-desk__quote-btn" id="profDeskNext" type="button" aria-label="Next quote">&#8250;</button>
                </div>` : ''}
            ` : ''}
          </div>
        </div>
      </section>`
    : '';

  return `
    <div class="prof-shell">
      <div class="prof-shell__inner">

        <header class="prof-header">
          ${avatarEl}
          <div class="prof-header__meta">
            <h1 class="prof-name">${escapeHtml(profile.displayName)}</h1>
            <p class="prof-slug">marginalia.app/${escapeHtml(profile.slug)}</p>
            ${bioEl}
            ${statsEl}
          </div>
        </header>

        ${mapSection}
        ${shelfSection}
        ${portraitSection}
        ${rhythmSection}
        ${deskSection}

      </div>
    </div>
  `;
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindProfileEvents(
  container: HTMLElement,
  highlights: PublicHighlight[],
  books: PublicBook[],
): void {
  bindShelfTabs(container, books);
  bindMapPills(container, books);
  bindHeatmapTabs(container);
  bindDeskQuoteNav(container, highlights, books);
}

function bindShelfTabs(container: HTMLElement, books: PublicBook[]): void {
  const tabsEl = container.querySelector<HTMLElement>('#profShelfTabs');
  const shelfEl = container.querySelector<HTMLElement>('#profShelf');
  if (!tabsEl || !shelfEl) return;

  const thisYear = new Date().getFullYear();

  function renderShelf(tab: string) {
    if (!shelfEl) return;
    let subset: PublicBook[];
    if (tab === 'recent') {
      subset = books.filter(b => b.status === 'read').slice(0, 20);
    } else if (tab === 'year') {
      subset = books.filter(b => b.status === 'read' && b.finishedAt && new Date(b.finishedAt).getFullYear() === thisYear);
    } else {
      subset = books.filter(b => b.status === 'read');
    }
    if (!subset.length) subset = books.slice(0, 20);
    shelfEl.innerHTML = subset.map(spineCardHTML).join('');
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.prof-tab');
    if (!btn) return;
    tabsEl.querySelectorAll('.prof-tab').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    renderShelf(btn.dataset.tab ?? 'recent');
  });

  renderShelf('recent');
}

function bindMapPills(container: HTMLElement, books: PublicBook[]): void {
  const pillsEl = container.querySelector<HTMLElement>('#profMapPills');
  if (!pillsEl) return;

  pillsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.prof-pill');
    if (!btn) return;
    pillsEl.querySelectorAll('.prof-pill').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const dim = btn.dataset.dim as 'authorOrigin' | 'contentLocation' | 'readerLocation';
    // Map re-render is handled by profile-map.ts after mount; dispatch event
    const mapEl = container.querySelector<HTMLElement>('#profMap');
    if (mapEl) mapEl.dispatchEvent(new CustomEvent('prof:dim-change', { detail: { dim }, bubbles: false }));
  });
}

function bindHeatmapTabs(container: HTMLElement): void {
  const tabsEl = container.querySelector<HTMLElement>('#profHeatmapTabs');
  if (!tabsEl) return;

  tabsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.prof-tab');
    if (!btn) return;
    tabsEl.querySelectorAll('.prof-tab').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const dim = btn.dataset.dim as 'sessions' | 'minutes' | 'highlights';
    const heatmapEl = container.querySelector<HTMLElement>('#profHeatmap');
    if (heatmapEl) heatmapEl.dispatchEvent(new CustomEvent('prof:heatmap-dim', { detail: { dim }, bubbles: false }));
  });
}

function bindDeskQuoteNav(container: HTMLElement, highlights: PublicHighlight[], books: PublicBook[]): void {
  const currentBook = books.find(b => b.status === 'reading');
  if (!currentBook) return;

  const deskHighlights = highlights.filter(h => h.bookId === currentBook.id);
  if (deskHighlights.length <= 1) return;

  let idx = 0;
  const textEl = container.querySelector<HTMLElement>('#profDeskQuoteText');
  const prevBtn = container.querySelector<HTMLElement>('#profDeskPrev');
  const nextBtn = container.querySelector<HTMLElement>('#profDeskNext');

  function show(i: number) {
    if (!textEl) return;
    textEl.classList.add('prof-fade');
    setTimeout(() => {
      textEl.textContent = deskHighlights[i].quote;
      textEl.classList.remove('prof-fade');
    }, 180);
  }

  prevBtn?.addEventListener('click', () => { idx = (idx - 1 + deskHighlights.length) % deskHighlights.length; show(idx); });
  nextBtn?.addEventListener('click', () => { idx = (idx + 1) % deskHighlights.length; show(idx); });
}

function spineCardHTML(book: PublicBook): string {
  return `
    <div class="prof-spine"
         style="background:${escapeHtml(book.spine)};color:${escapeHtml(book.text)}"
         title="${escapeHtml(book.title)} — ${escapeHtml(book.author)}"
         role="img"
         aria-label="${escapeHtml(book.title)} by ${escapeHtml(book.author)}">
      <span class="prof-spine__title">${escapeHtml(book.title)}</span>
      <span class="prof-spine__author">${escapeHtml(book.author)}</span>
    </div>
  `;
}

// ── Section mounting ─────────────────────────────────────────────────────────

function mountSections(
  container: HTMLElement,
  books: PublicBook[],
  highlights: PublicHighlight[],
  sessionDays: SessionDay[],
  profile: PublicProfileData,
): void {
  // Map
  if (profile.showMap) {
    const mapEl     = container.querySelector<HTMLElement>('#profMap');
    const captionEl = container.querySelector<HTMLElement>('#profMapCaption');
    if (mapEl) {
      const profileMap = new ProfileMap(mapEl, captionEl, books);
      profileMap.mount();
    }
  }

  // Heatmap
  if (profile.showRhythm && sessionDays.length > 0) {
    const heatmapEl = container.querySelector<HTMLElement>('#profHeatmap');
    if (heatmapEl) {
      const heatmap = new ProfileHeatmap(heatmapEl, sessionDays);
      heatmap.mount();
    }
  }

  // Reader Portrait
  if (profile.showPortrait) {
    const portraitEl = container.querySelector<HTMLElement>('#profPortraitMount');
    if (portraitEl) renderPortrait(portraitEl, books, highlights);
  }
}

function renderPortrait(container: HTMLElement, books: PublicBook[], highlights: PublicHighlight[]): void {
  // Portrait is AI-generated and cached in Firestore under ai_results/reader-portrait.
  // For the public view, we read the cached result (no re-generation trigger from visitors).
  // The actual generation is triggered from the owner's own session.
  const db = getDb();
  if (!db) {
    container.innerHTML = portraitLoadingHTML();
    return;
  }

  // We can't know the uid here on the public page without the profile object,
  // so we pass it through a data attribute set by profileHTML on the section.
  const section = container.closest<HTMLElement>('#profPortraitSection');
  const uid = section?.dataset.uid;
  if (!uid) {
    container.innerHTML = portraitLoadingHTML();
    return;
  }

  const wsId: string = (window as any).MARGINALIA_FIREBASE?.workspaceId ?? 'default';
  db.doc(`workspaces/${wsId}/users/${uid}/ai_results/reader-portrait`)
    .get()
    .then((snap: any) => {
      if (!snap.exists) {
        container.innerHTML = '';
        return;
      }
      const data = snap.data() as Record<string, any>;
      const result = data.userEdited ?? data.original;
      if (!result?.narrative) { container.innerHTML = ''; return; }
      container.innerHTML = portraitHTML(result);
    })
    .catch(() => { container.innerHTML = ''; });

  container.innerHTML = portraitLoadingHTML();
}

function portraitLoadingHTML(): string {
  return `<p class="prof-portrait--loading">Loading portrait…</p>`;
}

function portraitHTML(result: Record<string, any>): string {
  const narrative = escapeHtml(result.narrative ?? '');
  const version   = result.promptVersion ? `v${escapeHtml(String(result.promptVersion))}` : '';

  const breakdowns = result.breakdowns ?? {};
  const genreRows  = renderBarRows(breakdowns.genre  ?? []);
  const eraRows    = renderBarRows(breakdowns.era    ?? []);
  const themeRows  = renderBarRows(breakdowns.theme  ?? []);

  return `
    <div class="prof-portrait">
      <div class="prof-portrait__narrative">
        <div class="prof-portrait__ai-tag">
          <span class="prof-portrait__pulse" aria-hidden="true"></span>
          Generated portrait${version ? ' · ' + version : ''}
        </div>
        <p class="prof-portrait__text">${narrative}</p>
        <p class="prof-portrait__version">Refreshed weekly · based on your shared books and highlights</p>
      </div>
      <div class="prof-portrait__breakdowns">
        ${genreRows ? `<div><p class="prof-portrait__group-label">By genre</p>${genreRows}</div>` : ''}
        ${eraRows   ? `<div><p class="prof-portrait__group-label">By era</p>${eraRows}</div>` : ''}
        ${themeRows ? `<div><p class="prof-portrait__group-label">Margin themes</p>${themeRows}</div>` : ''}
      </div>
    </div>
  `;
}

function renderBarRows(rows: Array<{ label: string; pct: number }>): string {
  return rows.map(r => `
    <div class="prof-portrait__bar-row">
      <span class="prof-portrait__bar-label">${escapeHtml(r.label)}</span>
      <div class="prof-portrait__bar-track">
        <div class="prof-portrait__bar-fill" style="width:${Math.round(r.pct)}%"></div>
      </div>
      <span class="prof-portrait__bar-pct">${Math.round(r.pct)}%</span>
    </div>
  `).join('');
}

function escapeHtml(str: string): string {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
