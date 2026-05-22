import { renderUnifiedPanelHeader, renderToolPageShell } from '../core/app.js';
import { logError, logEvent } from '../services/analytics.ts';
import { renderProfileSettings } from './profile-settings.ts';
import { ProfileMap } from './profile-map.ts';
import { ProfileAnnualShelf } from './profile-year-in-review.ts';
import { MarginaliaAuth } from '../firebase/auth.js';
import { ENV } from '../core/env.ts';
import { BooksStore } from '../store/books-store.ts';
import {
  DEMO_PROFILE,
  buildDemoHighlights,
  buildDemoSessionDays,
  resolveDemoMerge,
  buildDemoPayloadFromBooks,
} from './profile-demo-resolver.ts';
import { loadAnnualShelf } from './annual-shelf-store.ts';
import { mountReadingIdentity } from './reading-identity.ts';
import { HeroBook } from '../components/hero-book/hero-book.js';
import type { PublicProfileData, PublicBook, PublicHighlight, SessionDay, DemoPayload } from './profile-types.ts';
import './profile.css';
import '../components/hero-book/hero-book.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FirestoreDB = any;

const REGION_NAMES = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;


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
    // Unauthenticated: render demo immediately, no loading screen
    const demo = buildDemoPayload();
    renderResolvedProfile(container, demo.profile, demo.books, demo.highlights, demo.sessionDays, false, true);
    logEvent('profile_viewed', { slug: 'demo-preview' });
    return;
  }

  // Owner preview (_uid set): render demo shell immediately so there's no black flash,
  // then swap in real data once the Firestore fetch completes.
  if (params._uid) {
    const demo = buildDemoPayload();
    const auth = MarginaliaAuth as any;
    const tentativeProfile: PublicProfileData = {
      uid: params._uid,
      slug: auth.user?.settings?.slug ?? '',
      profilePublic: false,
      displayName: capitalizeWords(String(auth.user?.displayName || auth.user?.email || 'Reader').split('@')[0]),
      avatarUrl: undefined,
      bio: undefined,
      showMap: true,
      showPortrait: false,
      showRhythm: true,
      showDesk: true,
    };
    renderResolvedProfile(container, tentativeProfile, demo.books, demo.highlights, demo.sessionDays, true, true);
  }

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

    const [realBooks, highlights0, sessionDays0] = await Promise.all([
      fetchPublicBooks(db, profileData.uid, ownerPreview),
      fetchPublicHighlights(db, profileData.uid, ownerPreview),
      fetchSessions(db, profileData.uid),
    ]);

    const books = resolveDemoMerge(realBooks);

    let highlights = highlights0;
    let sessionDays = sessionDays0;

    if (ownerPreview) {
      if (!highlights.length) highlights = buildDemoHighlights();
      if (!sessionDays.length) sessionDays = buildDemoSessionDays(books);
    }

    const isOwner = ownerPreview;
    renderResolvedProfile(container, profileData, books, highlights, sessionDays, isOwner, showSettingsAction);
    logEvent('profile_viewed', { slug: profileData.slug || 'owner-preview' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(error instanceof Error ? error : new Error(message), { context: 'enterProfile' });
    // If we already painted a shell, don't replace with an error — just log
    if (!params._uid) {
      container.innerHTML = stateShellHTML('Something went wrong', message, showSettingsAction);
    }
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
        userNote: data.userNote ?? undefined,
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

  return books;
}

async function fetchPublicHighlights(db: FirestoreDB, uid: string, ownerPreview = false): Promise<PublicHighlight[]> {
  const wsId: string = ENV.WORKSPACE_ID || 'default';
  try {
    if (ownerPreview) {
      const snap = await db.collection('workspaces').doc(wsId).collection('users').doc(uid).collection('highlights').limit(24).get();
      const highlights = snap.docs
        .map((doc: any) => {
          const data = doc.data() as Record<string, any>;
          return { quote: data.quote ?? '', bookTitle: data.bookTitle ?? '', bookId: data.bookId ?? undefined };
        })
        .filter((highlight: PublicHighlight) => highlight.quote.length > 0);
      return highlights.length ? highlights : buildDemoHighlights();
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
    ${profileHeaderHTML(showSettingsAction, DEMO_PROFILE, false)}
    <div class="prof-loading-shell">
      <div class="prof-loading" aria-label="Loading profile…"><span class="prof-loading__dot"></span></div>
    </div>
  `);
}

function stateShellHTML(title: string, body: string, showSettingsAction: boolean): string {
  return renderProfilePageShell(`
    ${profileHeaderHTML(showSettingsAction, DEMO_PROFILE, false)}
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

function capitalizeWords(name: string): string {
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ProfileOverviewStat {
  label: string;
  value: string;
}

interface ProfileOverview {
  stats: ProfileOverviewStat[];
  journeySummary: string;
  firstFinishedLabel: string | null;
  streakLabel: string;
  streakNote: string;
  statusEyebrow: string;
  statusTitle: string;
  statusBody: string;
}

interface JourneyOverview {
  cityCount: number;
  countryCount: number;
  continentCount: number;
  topGenres: Array<{ label: string; pct: number; count: number }>;
}

interface ClosingQuote {
  quote: string;
  source: string;
}

function profileHTML(
  profile: PublicProfileData,
  books: PublicBook[],
  highlights: PublicHighlight[],
  sessionDays: SessionDay[],
  isOwner: boolean,
  showSettingsAction: boolean,
): string {
  const auth = MarginaliaAuth as any;
  const authPhotoURL: string = auth.user?.photoURL ?? '';
  const avatarSrc = profile.avatarUrl || authPhotoURL;
  const displayName = capitalizeWords(profile.displayName);
  const overview = buildProfileOverview(profile, books, highlights, sessionDays, isOwner);
  const journey = buildJourneyOverview(books);
  const closingQuote = buildClosingQuote(highlights, books);
  const profileContext = buildProfileContext(books);

  let avatarEl: string;
  if (avatarSrc) {
    const imgTag = `<img class="prof-avatar" src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(displayName)}" loading="lazy">`;
    avatarEl = isOwner
      ? `<label class="prof-avatar-upload" title="Change photo" aria-label="Change profile photo">${imgTag}<input type="file" class="prof-avatar-file-input" accept="image/*" aria-hidden="true"></label>`
      : imgTag;
  } else {
    const initials = escapeHtml((displayName || '?').slice(0, 2).toUpperCase());
    const initialsDiv = `<div class="prof-avatar prof-avatar--initials" aria-hidden="true">${initials}</div>`;
    avatarEl = isOwner
      ? `<label class="prof-avatar-upload" title="Change photo" aria-label="Change profile photo">${initialsDiv}<input type="file" class="prof-avatar-file-input" accept="image/*" aria-hidden="true"></label>`
      : initialsDiv;
  }

  const header = profileHeaderHTML(showSettingsAction, profile, isOwner);

  const mapSection = profile.showMap ? `
    <section class="prof-section prof-section--journey" aria-label="Reading journey">
      <div class="prof-section__head prof-section__head--stacked">
        <div>
          <h2 class="prof-section__title">Reading Journey</h2>
          <p class="prof-section__subcopy">Books light your way.</p>
        </div>
        <div class="prof-journey-metrics" aria-label="Journey summary">
          <div class="prof-journey-metric">
            <strong>${journey.cityCount}</strong>
            <span>Cities</span>
          </div>
          <div class="prof-journey-metric">
            <strong>${journey.countryCount}</strong>
            <span>Countries</span>
          </div>
          <div class="prof-journey-metric">
            <strong>${journey.continentCount}</strong>
            <span>Continents</span>
          </div>
        </div>
        <div class="prof-map-head-right">
          <button class="prof-map-play-btn" id="profMapPlayBtn" type="button" aria-label="Play journey" disabled>
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><polygon points="4,2 14,8 4,14"/></svg>
          </button>
          <div class="prof-map-pills" id="profMapPills">
            <button class="prof-pill is-active" data-dim="journey" type="button">Journey</button>
            <button class="prof-pill" data-dim="contentLocation" type="button">Story</button>
            <button class="prof-pill" data-dim="authorOrigin" type="button">Author</button>
            <button class="prof-pill" data-dim="readerLocation" type="button">Reader</button>
          </div>
        </div>
      </div>
      <div class="prof-map-wrap">
        <div class="prof-map" id="profMap"></div>
        <div class="prof-map-caption" id="profMapCaption"></div>
        <div class="prof-map-zoom" id="profMapZoom">
          <button class="prof-map-zoom__btn" id="profMapZoomIn"  type="button" aria-label="Zoom in">+</button>
          <button class="prof-map-zoom__btn" id="profMapZoomOut" type="button" aria-label="Zoom out">−</button>
          <div class="prof-map-zoom__sep"></div>
          <button class="prof-map-zoom__btn prof-map-zoom__fit" id="profMapZoomFit" type="button" aria-label="Fit map">Fit</button>
        </div>
      </div>
      <div class="prof-map-rail" hidden>
        <div class="prof-map-rail__items" id="profMapRail"></div>
      </div>
    </section>
  ` : '';

  const finishedBooks = books.filter((book) => isFinishedStatus(book.status));

  const annualSection = (profile.showRhythm || finishedBooks.length) ? `
    <div id="profAnnualMount"></div>
  ` : '';

  const deskSection = '';

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
        <section class="prof-banner" aria-label="Reader profile">
          <div class="prof-banner__info">
            <div class="prof-banner__head">
              <div class="prof-banner__media">${avatarEl}</div>
              <div class="prof-banner__id">
                <h1 class="prof-name">${escapeHtml(displayName)}</h1>
                <p class="prof-reader-tagline">Soul of a curious wanderer</p>
                <div class="prof-banner__meta">
                  ${profileContext.location ? `
                    <div class="prof-banner__meta-item">
                      <svg class="prof-reader-meta__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M8 1.5A4.5 4.5 0 0 1 12.5 6c0 3-4.5 8.5-4.5 8.5S3.5 9 3.5 6A4.5 4.5 0 0 1 8 1.5Z" stroke="currentColor" stroke-width="1.2"/>
                        <circle cx="8" cy="6" r="1.5" stroke="currentColor" stroke-width="1.2"/>
                      </svg>
                      <span>${escapeHtml(profileContext.location)}</span>
                    </div>
                  ` : ''}
                  ${profileContext.joinedLabel ? `
                    <div class="prof-banner__meta-item">
                      <svg class="prof-reader-meta__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <rect x="2" y="3.5" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
                        <path d="M5 2v3M11 2v3M2 7h12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                      </svg>
                      <span>Joined ${escapeHtml(profileContext.joinedLabel)}</span>
                    </div>
                  ` : ''}
                </div>
              </div>
            </div>
            <div class="prof-banner__stats" aria-label="Reading overview">
              ${overview.stats.map((stat) => `
                <div class="prof-banner__stat">
                  <strong>${escapeHtml(stat.value)}</strong>
                  <span>${escapeHtml(stat.label)}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="prof-banner__room" aria-hidden="true">
            <div class="prof-banner__room-img"></div>
            <div class="prof-banner__room-fade"></div>
          </div>
        </section>

        <section class="prof-section prof-section--identity" aria-label="Reading identity">
          <div id="profIdentityMount"></div>
        </section>

        ${mapSection}
        ${annualSection}
        ${deskSection}
        ${portraitSection}
        <section class="prof-share-cta" aria-label="Share your profile">
          <div class="prof-share-cta__stage">
            <div class="prof-share-cta__book book cta" id="profShareBook" role="button" tabindex="0" aria-label="Generate share link">
              <div class="prof-share-cta__book-mount" id="profShareBookMount"></div>
              <div class="cta-label" id="profShareCtaLabel">Generate share link</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
}

function bindProfileChrome(container: HTMLElement, settingsOnly: boolean): void {
  const settingsBtn = container.querySelector<HTMLElement>('#profileHeaderSettingsBtn');
  settingsBtn?.addEventListener('click', () => enterProfile({ _settingsOnly: true }));
  container.querySelector<HTMLElement>('#profileHeaderShareBtn')?.addEventListener('click', async () => {
    const shareTarget = container.querySelector<HTMLElement>('#profileHeaderShareBtn')?.getAttribute('data-share-url') || window.location.href;
    const btn = container.querySelector<HTMLButtonElement>('#profileHeaderShareBtn');
    const label = btn?.querySelector<HTMLElement>('.prof-header-action__label');
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(shareTarget);
      else throw new Error('Clipboard unavailable');
      if (label) label.textContent = 'Copied';
      window.setTimeout(() => { if (label) label.textContent = 'Share'; }, 1600);
    } catch {
      window.open(shareTarget, '_blank', 'noopener,noreferrer');
    }
  });

  if (settingsOnly) {
    container.querySelector<HTMLElement>('#profileBackToProfileBtn')?.addEventListener('click', () => enterProfile());
  }

  // Bottom share section — GLB hero book + preloader "Enter Library"-style CTA.
  const shareBook = container.querySelector<HTMLElement>('#profShareBook');
  const shareMount = container.querySelector<HTMLElement>('#profShareBookMount');
  const shareLabel = container.querySelector<HTMLElement>('#profShareCtaLabel');
  if (shareBook && shareMount) {
    const heroBook = new HeroBook({ height: 240 });
    heroBook.mount(shareMount);
    // Dock the book and reveal the label, mirroring the preloader CTA state.
    window.setTimeout(() => shareBook.classList.add('docked'), 16);

    let sharing = false;
    const doShare = async () => {
      if (sharing) return;
      sharing = true;
      const shareTarget = container.querySelector<HTMLElement>('#profileHeaderShareBtn')?.getAttribute('data-share-url') || window.location.href;
      // Open the book — preloader's final cover flip.
      heroBook.open();
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(shareTarget);
        else throw new Error('Clipboard unavailable');
        if (shareLabel) shareLabel.textContent = 'Link copied';
      } catch {
        window.open(shareTarget, '_blank', 'noopener,noreferrer');
        if (shareLabel) shareLabel.textContent = 'Opening…';
      }
      window.setTimeout(() => {
        heroBook.close();
        if (shareLabel) shareLabel.textContent = 'Generate share link';
        sharing = false;
      }, 1800);
    };

    shareBook.addEventListener('click', doShare);
    shareBook.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doShare(); }
    });
  }
}

function bindProfileEvents(
  container: HTMLElement,
  _highlights: PublicHighlight[],
  _books: PublicBook[],
): void {
  bindMapPills(container);
  bindAvatarUpload(container);
}

function bindAvatarUpload(container: HTMLElement): void {
  const fileInput = container.querySelector<HTMLInputElement>('.prof-avatar-file-input');
  if (!fileInput) return;

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;
      const img = container.querySelector<HTMLImageElement>('.prof-avatar-upload .prof-avatar');
      if (img) {
        img.src = dataUrl;
      } else {
        const wrap = container.querySelector<HTMLElement>('.prof-avatar-upload');
        if (wrap) {
          const existingDiv = wrap.querySelector<HTMLElement>('.prof-avatar--initials');
          if (existingDiv) {
            const newImg = document.createElement('img');
            newImg.className = 'prof-avatar';
            newImg.alt = '';
            newImg.src = dataUrl;
            wrap.replaceChild(newImg, existingDiv);
          }
        }
      }
      try {
        const auth = MarginaliaAuth as any;
        const db = auth.db;
        const uid = auth.user?.uid;
        if (db && uid) {
          db.doc(`users/${uid}`).set({ avatarUrl: dataUrl }, { merge: true }).catch(() => {});
        }
      } catch { /* best-effort */ }
    };
    reader.readAsDataURL(file);
  });
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

  const annualEl = container.querySelector<HTMLElement>('#profAnnualMount');
  if (annualEl) {
    const db = getDb();
    const mountAnnual = async () => {
      let savedOrder: string[] | null = null;
      if (isOwner && db && profile.uid) {
        const doc = await loadAnnualShelf(db, profile.uid, new Date().getFullYear()).catch(() => null);
        savedOrder = doc?.bookIds ?? null;
      }
      const annual = new ProfileAnnualShelf({
        host: annualEl,
        books,
        sessionDays,
        allowOpenDetails: isOwner,
        showRhythm: profile.showRhythm ?? true,
        isOwner,
        db: db ?? undefined,
        uid: profile.uid,
        savedOrder,
      });
      annual.mount();
    };
    mountAnnual().catch(() => {
      const annual = new ProfileAnnualShelf({
        host: annualEl,
        books,
        sessionDays,
        allowOpenDetails: isOwner,
        showRhythm: profile.showRhythm ?? true,
      });
      annual.mount();
    });
  }

  if (profile.showPortrait) {
    const portraitEl = container.querySelector<HTMLElement>('#profPortraitMount');
    if (portraitEl) renderPortrait(portraitEl, books, highlights);
  }

  const identityEl = container.querySelector<HTMLElement>('#profIdentityMount');
  if (identityEl) mountReadingIdentity(identityEl, undefined, {
    revealImmediately: !isOwner && Boolean(profile.slug),
    genres: buildJourneyOverview(books).topGenres,
  });
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

function buildProfileOverview(
  profile: PublicProfileData,
  books: PublicBook[],
  highlights: PublicHighlight[],
  sessionDays: SessionDay[],
  isOwner: boolean,
): ProfileOverview {
  const finishedBooks = books.filter((book) => isFinishedStatus(book.status));
  const readingDays = sessionDays.filter((day) => day.sessions > 0).length;
  const currentStreak = computeCurrentStreak(sessionDays);
  const longestStreak = computeLongestStreak(sessionDays);
  const firstFinishedAt = finishedBooks
    .map((book) => book.finishedAt ?? 0)
    .filter((stamp) => stamp > 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const firstFinishedLabel = firstFinishedAt
    ? new Date(firstFinishedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;
  const hasIdentity = finishedBooks.length >= 3;
  const hasQuote = highlights.length > 0;
  const stats: ProfileOverviewStat[] = [
    { label: 'Books Finished', value: formatInt(finishedBooks.length) },
    { label: 'Reading Days', value: formatInt(readingDays) },
    { label: 'Highlights Saved', value: formatInt(highlights.length) },
    { label: currentStreak > 0 ? 'Current Streak' : 'Longest Streak', value: formatInt(currentStreak > 0 ? currentStreak : longestStreak) },
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
    streakLabel: currentStreak > 0 ? 'Current Streak' : 'Longest Stretch',
    streakNote: currentStreak > 0 ? `${currentStreak} days and still going` : `${Math.max(1, longestStreak)} days at full glow`,
    statusEyebrow,
    statusTitle,
    statusBody,
  };
}

function buildJourneyOverview(books: PublicBook[]): JourneyOverview {
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
    .slice(0, 5);
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

function buildClosingQuote(highlights: PublicHighlight[], books: PublicBook[]): ClosingQuote | null {
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

function buildProfileContext(books: PublicBook[]): { location: string | null; joinedLabel: string | null } {
  const finishedBooks = books.filter((book) => isFinishedStatus(book.status));
  const countryCounts = new Map<string, number>();
  let earliestStamp = 0;
  finishedBooks.forEach((book) => {
    const country = book.geo?.readerLocation?.country || book.geo?.contentLocation?.country || book.geo?.authorOrigin?.country;
    if (country) countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
    const stamp = book.finishedAt ?? 0;
    if (stamp > 0 && (earliestStamp === 0 || stamp < earliestStamp)) earliestStamp = stamp;
  });
  const topCountry = [...countryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const location = topCountry ? countryName(topCountry) : null;
  const joinedLabel = earliestStamp
    ? new Date(earliestStamp).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;
  return { location, joinedLabel };
}

function computeCurrentStreak(sessionDays: SessionDay[]): number {
  const activeDays = [...new Set(sessionDays.filter((day) => day.sessions > 0).map((day) => day.date))].sort();
  if (!activeDays.length) return 0;
  let streak = 1;
  for (let index = activeDays.length - 1; index > 0; index--) {
    const current = new Date(`${activeDays[index]}T00:00:00Z`).getTime();
    const previous = new Date(`${activeDays[index - 1]}T00:00:00Z`).getTime();
    if (current - previous === 86400000) streak += 1;
    else break;
  }
  return streak;
}

function computeLongestStreak(sessionDays: SessionDay[]): number {
  const activeDays = [...new Set(sessionDays.filter((day) => day.sessions > 0).map((day) => day.date))].sort();
  if (!activeDays.length) return 0;
  let best = 1;
  let current = 1;
  for (let index = 1; index < activeDays.length; index++) {
    const previous = new Date(`${activeDays[index - 1]}T00:00:00Z`).getTime();
    const next = new Date(`${activeDays[index]}T00:00:00Z`).getTime();
    if (next - previous === 86400000) current += 1;
    else current = 1;
    if (current > best) best = current;
  }
  return best;
}

function countryContinent(code: string): string | null {
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

function formatInt(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)));
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

function profileHeaderHTML(showSettingsAction: boolean, profile: PublicProfileData, isOwner: boolean): string {
  const shareUrl = buildProfileShareUrl(profile);
  const actions: string[] = [];
  if (showSettingsAction && isOwner) {
    actions.push('<button class="panel-header-action" id="profileHeaderSettingsBtn">Edit Profile</button>');
  }
  if (shareUrl) {
    actions.push(`
      <button class="panel-header-action prof-header-action--icon" id="profileHeaderShareBtn" type="button" data-share-url="${escapeHtml(shareUrl)}" aria-label="Share profile">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 5V2.5H5V5"></path>
          <path d="M8 10V2.5"></path>
          <rect x="3" y="6" width="10" height="7" rx="1.5"></rect>
        </svg>
        <span class="prof-header-action__label">Share</span>
      </button>
    `);
  }
  if (!actions.length) actions.push('<span class="panel-header-spacer" aria-hidden="true"></span>');
  return renderProfileHeader('profile', { rightHTML: `<div class="prof-header-actions">${actions.join('')}</div>` });
}

function buildProfileShareUrl(profile: PublicProfileData): string {
  if (profile.slug) return `${window.location.origin}${window.location.pathname}#/p/${profile.slug}`;
  return window.location.href;
}

function buildDemoPayload(): DemoPayload {
  const sourceBooks = BooksStore.getAll()
    .map((record) => mapStoreBookToPublicBook(record))
    .filter((book): book is PublicBook => Boolean(book));
  const payload = buildDemoPayloadFromBooks(sourceBooks);
  const books = payload.books
    .map((book) => ({ ...book, status: normalizeProfileStatus(book.status) }))
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  return { ...payload, books };
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
    userNote: record.userNote ?? undefined,
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


function toTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  // Firestore Timestamp object
  if (value !== null && typeof value === 'object') {
    const ts = value as Record<string, unknown>;
    if (typeof ts['toMillis'] === 'function') return (ts['toMillis'] as () => number)();
    if (typeof ts['seconds'] === 'number') return ts['seconds'] * 1000;
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
