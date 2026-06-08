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
  buildDemoPayloadFromBooks,
} from './profile-demo-resolver.ts';
import { loadAnnualShelf } from './annual-shelf-store.ts';
import { mountReadingIdentity } from './reading-identity.ts';
import { PixelReader } from '../components/pixel-avatar/pixel-avatar.ts';
import { HeroBook } from '../components/hero-book/hero-book.js';
import { maybeSettleFrameFlyIn } from '../three-room/frame-fly.js';
import {
  normalizeProfileStatus,
  isFinishedStatus,
  toTimestamp,
  formatInt,
  countryName,
  buildJourneyOverview,
  buildProfileOverview,
  buildProfileContext,
  buildClosingQuote,
} from './profile-stats.ts';
import type { PublicProfileData, PublicBook, PublicHighlight, SessionDay, ActivityDay, DemoPayload } from './profile-types.ts';
import './profile.css';
import '../components/hero-book/hero-book.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FirestoreDB = any;


export function initProfile(): void {
  return;
}

export async function enterProfile(params: { slug?: string; _settingsOnly?: boolean; _preview?: boolean; _uid?: string; __roomTransition?: { source?: string } } = {}): Promise<void> {
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
    renderResolvedProfile(container, demo.profile, demo.books, demo.highlights, [], 0, 0, false, true);
    logEvent('profile_viewed', { slug: 'demo-preview' });
    return;
  }

  // Owner preview (_uid set): render demo shell immediately so there's no black flash,
  // then swap in real data once the Firestore fetch completes.
  if (params._uid) {
    const auth = MarginaliaAuth as any;
    const creationTime: string | undefined = auth.user?.metadata?.creationTime;
    const tentativeProfile: PublicProfileData = {
      uid: params._uid,
      slug: auth.user?.settings?.slug ?? '',
      profilePublic: false,
      displayName: capitalizeWords(String(auth.user?.displayName || auth.user?.email || 'Reader').split('@')[0]),
      avatarUrl: undefined,
      bio: undefined,
      joinedAt: creationTime ? Date.parse(creationTime) : undefined,
      showMap: true,
      showPortrait: false,
      showRhythm: true,
      showDesk: true,
    };
    renderResolvedProfile(container, tentativeProfile, [], [], [], 0, 0, true, true);
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

    const [realBooks, highlights0, notesCount, actionsDoneCount, activityDays] = await Promise.all([
      fetchPublicBooks(db, profileData.uid, ownerPreview),
      fetchPublicHighlights(db, profileData.uid, ownerPreview),
      fetchNotesCount(db, profileData.uid),
      fetchActionsDoneCount(db, profileData.uid),
      fetchActivityDays(db, profileData.uid),
    ]);

    const books = realBooks;
    const highlights = highlights0;

    const isOwner = ownerPreview;
    renderResolvedProfile(container, profileData, books, highlights, activityDays, notesCount, actionsDoneCount, isOwner, showSettingsAction);
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

function buildProfileData(uid: string, data: Record<string, any>, joinedAt?: number): PublicProfileData {
  const settings = data.settings ?? {};
  const profileSettings = settings.profileSections ?? {};
  const locationCountry: string | null = settings.location?.country ?? data.location?.country ?? data.loc ?? null;
  return {
    uid,
    slug: settings.slug ?? '',
    profilePublic: settings.profilePublic ?? false,
    displayName: data.displayName || settings.username || settings.slug || uid,
    avatarUrl: data.avatarUrl ?? undefined,
    bio: settings.bio ?? undefined,
    location: locationCountry ? countryName(locationCountry) : (settings.location?.city ?? undefined),
    joinedAt,
    showMap: profileSettings.map !== false,
    showPortrait: profileSettings.portrait === true,
    showRhythm: profileSettings.rhythm !== false,
    showDesk: profileSettings.desk !== false,
  };
}

async function lookupByUid(db: FirestoreDB, uid: string): Promise<PublicProfileData | null> {
  const auth = MarginaliaAuth as any;
  const creationTime: string | undefined = auth.user?.metadata?.creationTime;
  const joinedAt = creationTime ? Date.parse(creationTime) : undefined;
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) return null;
  return buildProfileData(uid, snap.data() as Record<string, any>, joinedAt);
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
      return highlights;
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

async function fetchNotesCount(db: FirestoreDB, uid: string): Promise<number> {
  const wsId: string = ENV.WORKSPACE_ID || 'default';
  try {
    const booksSnap = await db
      .collection('workspaces').doc(wsId)
      .collection('users').doc(uid)
      .collection('books')
      .limit(200)
      .get();
    const checks = booksSnap.docs.map((bookDoc: any) =>
      db.collection('workspaces').doc(wsId)
        .collection('users').doc(uid)
        .collection('books').doc(bookDoc.id)
        .collection('notes').doc('main')
        .get()
    );
    const noteSnaps = await Promise.all(checks);
    return noteSnaps.filter((s: any) => s.exists).length;
  } catch {
    return 0;
  }
}

async function fetchActionsDoneCount(db: FirestoreDB, uid: string): Promise<number> {
  const wsId: string = ENV.WORKSPACE_ID || 'default';
  try {
    const snap = await db
      .collection('workspaces').doc(wsId)
      .collection('users').doc(uid)
      .collection('actions')
      .where('status', '==', 'done')
      .get();
    return snap.size;
  } catch {
    return 0;
  }
}

async function fetchActivityDays(db: FirestoreDB, uid: string): Promise<ActivityDay[]> {
  const wsId: string = ENV.WORKSPACE_ID || 'default';
  const cutoff = Date.now() - 365 * 2 * 24 * 60 * 60 * 1000;
  const toDate = (ts: unknown): string | null => {
    const ms = typeof ts === 'number' ? ts
      : (ts as any)?.seconds ? (ts as any).seconds * 1000
      : null;
    if (!ms || ms < cutoff) return null;
    return new Date(ms).toISOString().slice(0, 10);
  };
  const dateSet = new Set<string>();
  try {
    const base = db.collection('workspaces').doc(wsId).collection('users').doc(uid);
    const [booksSnap, highlightsSnap, actionsSnap] = await Promise.all([
      base.collection('books').limit(500).get(),
      base.collection('highlights').where('_createdAt', '>=', cutoff).limit(2000).get(),
      base.collection('actions').where('createdAt', '>=', cutoff).limit(2000).get(),
    ]);
    booksSnap.docs.forEach((doc: any) => {
      const d = doc.data();
      const date = toDate(d._createdAt) ?? toDate(d.finishedAt);
      if (date) dateSet.add(date);
    });
    highlightsSnap.docs.forEach((doc: any) => {
      const date = toDate(doc.data()._createdAt);
      if (date) dateSet.add(date);
    });
    actionsSnap.docs.forEach((doc: any) => {
      const date = toDate(doc.data().createdAt);
      if (date) dateSet.add(date);
    });
  } catch {
    // return whatever we collected so far
  }
  return [...dateSet].map((date) => ({ date }));
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

function profileHTML(
  profile: PublicProfileData,
  books: PublicBook[],
  highlights: PublicHighlight[],
  activityDays: ActivityDay[],
  notesCount: number,
  actionsDoneCount: number,
  isOwner: boolean,
  showSettingsAction: boolean,
): string {
  const auth = MarginaliaAuth as any;
  const authPhotoURL: string = auth.user?.photoURL ?? '';
  const avatarSrc = profile.avatarUrl || authPhotoURL;
  const displayName = capitalizeWords(profile.displayName);
  const overview = buildProfileOverview(profile, books, highlights, activityDays, notesCount, actionsDoneCount, isOwner);
  const journey = buildJourneyOverview(books);
  const closingQuote = buildClosingQuote(highlights, books);
  const profileContext = buildProfileContext(profile);

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
              <div class="prof-banner__media" data-profile-avatar-target>${avatarEl}</div>
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
          <button type="button" class="prof-banner__room" data-view="room" aria-label="Enter your 3D reading room">
            <div class="prof-banner__room-img"></div>
            <div class="prof-banner__room-fade"></div>
            <div class="prof-banner__room-avatar" id="profBannerRoomAvatar" aria-hidden="true"></div>
            <span class="prof-banner__room-cue">Enter room</span>
          </button>
        </section>

        <section class="prof-section prof-section--identity" aria-label="Reading identity">
          <div id="profIdentityMount"></div>
        </section>

        ${mapSection}
        ${annualSection}
        ${deskSection}
        ${portraitSection}
        <section class="prof-share-cta" aria-label="Export reading card">
          <div class="prof-share-cta__stage">
            <div class="prof-share-cta__book book cta" id="profShareBook" role="button" tabindex="0" aria-label="Export reading card">
              <div class="prof-share-cta__book-mount" id="profShareBookMount"></div>
              <div class="cta-label" id="profShareCtaLabel">Export reading card</div>
            </div>
          </div>
        </section>
      </div>

      <div class="prof-snapshot-modal" id="profSnapshotModal" role="dialog" aria-modal="true" aria-label="Reading card preview" hidden>
        <div class="prof-snapshot-modal__backdrop" id="profSnapshotBackdrop"></div>
        <div class="prof-snapshot-modal__panel">
          <div class="prof-snapshot-modal__head">
            <span class="prof-snapshot-modal__title">Reading card</span>
            <button class="prof-snapshot-modal__close" id="profSnapshotClose" type="button" aria-label="Close">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg>
            </button>
          </div>
          <div class="prof-snapshot-modal__preview" id="profSnapshotPreview">
            <div class="prof-snapshot-modal__spinner" aria-label="Generating…"></div>
          </div>
          <div class="prof-snapshot-modal__actions">
            <button class="prof-snapshot-btn prof-snapshot-btn--primary" id="profSnapshotDownload" type="button" disabled>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v8M5 7l3 3 3-3"/><rect x="2" y="11" width="12" height="3" rx="1"/></svg>
              Save image
            </button>
            <button class="prof-snapshot-btn prof-snapshot-btn--ghost" id="profSnapshotShare" type="button" disabled hidden>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="3" r="1.5"/><circle cx="12" cy="13" r="1.5"/><circle cx="4" cy="8" r="1.5"/><path d="M5.4 7.3l5.2-3M5.4 8.7l5.2 3"/></svg>
              Share
            </button>
          </div>
        </div>
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

  // Room image → zoom in, then enter the 3D room at the FRONT camera angle.
  // Intercept the generic data-view delegate so the zoom plays before nav.
  const roomAvatarMount = container.querySelector<HTMLElement>('#profBannerRoomAvatar');
  if (roomAvatarMount) {
    const roomReader = new PixelReader({ state: 'reading', size: 'lg', accentColor: '#c49a52' });
    roomReader.mount(roomAvatarMount);
  }

  const roomBtn = container.querySelector<HTMLElement>('.prof-banner__room');
  if (roomBtn) {
    roomBtn.addEventListener('click', (e) => {
      if (roomBtn.classList.contains('is-zooming')) return;
      e.preventDefault();
      e.stopPropagation();
      roomBtn.classList.add('is-zooming');
      void import('../three-room/three-room-view.js')
        .then(({ setRoomEntryPose }) => setRoomEntryPose('front'))
        .catch(() => {});
      window.setTimeout(() => { window.location.hash = '#room'; }, 520);
    }, true);
  }

  // Bottom export card — GLB hero book CTA → snapshot preview modal.
  const shareBook = container.querySelector<HTMLElement>('#profShareBook');
  const shareMount = container.querySelector<HTMLElement>('#profShareBookMount');
  const shareLabel = container.querySelector<HTMLElement>('#profShareCtaLabel');
  if (shareBook && shareMount) {
    const heroBook = new HeroBook({ height: 240 });
    heroBook.mount(shareMount);
    window.setTimeout(() => shareBook.classList.add('docked'), 16);

    const openExportModal = () => { openSnapshotModal(container, heroBook, shareLabel); };
    shareBook.addEventListener('click', openExportModal);
    shareBook.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openExportModal(); }
    });
  }
}

function openSnapshotModal(
  container: HTMLElement,
  heroBook: InstanceType<typeof HeroBook>,
  shareLabel: HTMLElement | null,
): void {
  const modal = container.querySelector<HTMLElement>('#profSnapshotModal');
  const preview = container.querySelector<HTMLElement>('#profSnapshotPreview');
  const downloadBtn = container.querySelector<HTMLButtonElement>('#profSnapshotDownload');
  const shareBtn = container.querySelector<HTMLButtonElement>('#profSnapshotShare');
  const closeBtn = container.querySelector<HTMLButtonElement>('#profSnapshotClose');
  const backdrop = container.querySelector<HTMLElement>('#profSnapshotBackdrop');
  if (!modal || !preview || !downloadBtn) return;

  heroBook.open();

  // The profile panel (.room-panel) sets transform + filter, which makes it a
  // containing block for position:fixed children — that pins the sheet to the
  // panel's scrolled content box instead of the viewport. Re-parent the modal
  // to <body> so it anchors to the viewport bottom where the user just clicked.
  const homeParent = modal.parentElement;
  const homeNext = modal.nextElementSibling;
  document.body.appendChild(modal);

  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('is-open'));

  // Reset to spinner state.
  preview.innerHTML = '<div class="prof-snapshot-modal__spinner" aria-label="Generating…"></div>';
  downloadBtn.disabled = true;
  if (shareBtn) shareBtn.disabled = true;

  let snapshotBlob: Blob | null = null;

  const close = () => {
    modal.classList.remove('is-open');
    window.setTimeout(() => {
      modal.hidden = true;
      // Return the modal to its original spot in the profile DOM.
      if (homeParent) homeParent.insertBefore(modal, homeNext);
    }, 400);
    heroBook.close();
  };

  closeBtn?.addEventListener('click', close, { once: true });
  backdrop?.addEventListener('click', close, { once: true });

  const shareUrl = container.querySelector<HTMLElement>('#profileHeaderShareBtn')
    ?.getAttribute('data-share-url') || window.location.href;

  void import('./profile-snapshot.ts').then(async ({ captureProfileSnapshot, downloadSnapshot, shareSnapshot }) => {
    try {
      const result = await captureProfileSnapshot(container, { shareUrl });
      snapshotBlob = result.blob;

      const img = document.createElement('img');
      img.src = result.dataUrl;
      img.alt = 'Reading card preview';
      img.className = 'prof-snapshot-modal__img';
      preview.innerHTML = '';
      preview.appendChild(img);

      downloadBtn.disabled = false;
      downloadBtn.addEventListener('click', () => {
        if (snapshotBlob) void downloadSnapshot(snapshotBlob);
      }, { once: true });

      // Show Share button only when Web Share API supports files.
      const canShareFile = navigator.canShare?.({
        files: [new File([result.blob], 'profile.png', { type: 'image/png' })],
      });
      if (shareBtn && canShareFile) {
        shareBtn.hidden = false;
        shareBtn.disabled = false;
        shareBtn.addEventListener('click', () => {
          if (snapshotBlob) void shareSnapshot(snapshotBlob);
        }, { once: true });
      }
    } catch (err) {
      preview.innerHTML = '<p class="prof-snapshot-modal__error">Could not generate image. Try scrolling to the top first.</p>';
      logError(err instanceof Error ? err : new Error(String(err)), { context: 'openSnapshotModal' });
    }
  });
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
  _activityDays: ActivityDay[],
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
        sessionDays: [],
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
        sessionDays: [],
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
    books: books.map((b) => ({
      title: b.title,
      author: b.author,
      genre: b.genre,
      language: b.language,
      year: b.year,
      status: b.status,
    })),
    highlights: highlights.map((h) => ({ quote: h.quote, bookTitle: h.bookTitle })),
    sessionDays: [],
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

function renderResolvedProfile(
  container: HTMLElement,
  profileData: PublicProfileData,
  books: PublicBook[],
  highlights: PublicHighlight[],
  activityDays: ActivityDay[],
  notesCount: number,
  actionsDoneCount: number,
  isOwner: boolean,
  showSettingsAction: boolean,
): void {
  container.innerHTML = renderProfilePageShell(profileHTML(profileData, books, highlights, activityDays, notesCount, actionsDoneCount, isOwner, showSettingsAction));
  bindProfileChrome(container, false);
  bindProfileEvents(container, highlights, books);
  mountSections(container, books, highlights, activityDays, profileData, isOwner);
  maybeSettleFrameFlyIn(container);
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
