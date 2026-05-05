/* Marginalia · Public Profile View
   Route: #/p/{slug}
   No auth required to view. Reads public Firestore data via slug lookup.

   Layout: display name, public spine cards, reading stats,
   one rotating public highlight quote.
   Typography and color: tokens only — no raw hex, no system sans-serif.
*/

import { SpineCard } from '../components/spine-card.js';
import { logError, logEvent } from '../services/analytics.ts';
import { renderProfileSettings } from './profile-settings.ts';
import './profile.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FirestoreDB = any;

interface PublicProfileData {
  displayName: string;
  uid: string;
  slug: string;
  profilePublic: boolean;
  avatarUrl?: string;
}

interface PublicBook {
  id: string;
  title: string;
  author: string;
  spine: string;
  text: string;
  status?: string;
  finishedAt?: number;
}

interface PublicHighlight {
  quote: string;
  bookTitle: string;
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

    const [books, highlights, stats] = await Promise.all([
      fetchPublicBooks(db, profileData.uid),
      fetchPublicHighlights(db, profileData.uid),
      fetchStats(db, profileData.uid),
    ]);

    container.innerHTML = profileHTML(profileData, books, highlights, stats);
    bindProfileEvents(container, highlights);
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

  return {
    uid:           doc.id,
    slug:          settings.slug ?? slug,
    profilePublic: settings.profilePublic ?? false,
    displayName:   data.displayName || settings.username || slug,
    avatarUrl:     data.avatarUrl ?? undefined,
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
      return {
        id:         doc.id,
        title:      d.title  ?? meta.title  ?? meta.titleZh  ?? 'Untitled',
        author:     d.author ?? meta.author ?? meta.authorZh ?? '',
        spine:      d.spine  ?? cover.bg    ?? '#4a4035',
        text:       d.text   ?? cover.text  ?? '#e8dfc8',
        status:     d.status ?? user.status,
        finishedAt: d.finishedAt ?? user.finishedAt ?? 0,
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
      return { quote: d.quote ?? '', bookTitle: d.bookTitle ?? '' };
    }).filter((h: PublicHighlight) => h.quote.length > 0);
  } catch {
    // CollectionGroup query may fail if index not yet built; degrade gracefully.
    return [];
  }
}

async function fetchStats(db: FirestoreDB, uid: string): Promise<{ totalBooks: number; readBooks: number }> {
  const wsId: string = (window as any).MARGINALIA_FIREBASE?.workspaceId ?? 'default';
  try {
    const snap = await db
      .collection(`workspaces/${wsId}/users/${uid}/books`)
      .get();
    const totalBooks = snap.size;
    const readBooks  = snap.docs.filter((d: any) => d.data()?.status === 'read').length;
    return { totalBooks, readBooks };
  } catch {
    return { totalBooks: 0, readBooks: 0 };
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
      <a class="prof-state__link" href="#shelf">Back to shelf</a>
    </div>
  `;
}

function privateHTML(name: string): string {
  return `
    <div class="prof-state">
      <p class="prof-state__title">${escapeHtml(name)}</p>
      <p class="prof-state__body">This profile is private.</p>
      <a class="prof-state__link" href="#shelf">Back to shelf</a>
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
  stats: { totalBooks: number; readBooks: number },
): string {
  const spineRows = books.length
    ? `<div class="prof-spines" id="profSpines">${books.map(spineHTML).join('')}</div>`
    : `<p class="prof-empty">No books shared yet.</p>`;

  const highlightBlock = highlights.length
    ? `
      <blockquote class="prof-quote" id="profQuote">
        <p class="prof-quote__text" id="profQuoteText">${escapeHtml(highlights[0].quote)}</p>
        <footer class="prof-quote__source" id="profQuoteSource">${escapeHtml(highlights[0].bookTitle)}</footer>
      </blockquote>
    `
    : '';

  const initials = (profile.displayName || '?').slice(0, 2).toUpperCase();
  const avatarHTML = profile.avatarUrl
    ? `<img class="prof-avatar" src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(profile.displayName)}" loading="lazy">`
    : `<div class="prof-avatar prof-avatar--initials" aria-hidden="true">${escapeHtml(initials)}</div>`;

  return `
    <div class="prof-shell">
      <div class="prof-shell__inner">

        <header class="prof-header">
          ${avatarHTML}
          <div class="prof-header__meta">
            <h1 class="prof-name">${escapeHtml(profile.displayName)}</h1>
            <div class="prof-stats">
              <span class="prof-stat">
                <span class="prof-stat__num">${stats.totalBooks}</span>
                <span class="prof-stat__label">books</span>
              </span>
              <span class="prof-stat">
                <span class="prof-stat__num">${stats.readBooks}</span>
                <span class="prof-stat__label">read</span>
              </span>
            </div>
          </div>
        </header>

        ${highlightBlock}

        <section class="prof-section">
          <h2 class="prof-section__title">Reading shelf</h2>
          ${spineRows}
        </section>

      </div>
    </div>
  `;
}

function spineHTML(book: PublicBook): string {
  // Render a static spine card (no click nav — visitor may not be signed in)
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

// ── Events ────────────────────────────────────────────────────────────────────

function bindProfileEvents(container: HTMLElement, highlights: PublicHighlight[]): void {
  if (highlights.length <= 1) return;

  let idx = 0;
  _rotateTimer = setInterval(() => {
    idx = (idx + 1) % highlights.length;
    const textEl   = container.querySelector<HTMLElement>('#profQuoteText');
    const sourceEl = container.querySelector<HTMLElement>('#profQuoteSource');
    const quoteEl  = container.querySelector<HTMLElement>('#profQuote');
    if (!textEl || !sourceEl || !quoteEl) return;

    quoteEl.classList.add('prof-quote--fade');
    setTimeout(() => {
      textEl.textContent   = highlights[idx].quote;
      sourceEl.textContent = highlights[idx].bookTitle;
      quoteEl.classList.remove('prof-quote--fade');
    }, 260);
  }, 8000);
}

function escapeHtml(str: string): string {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
