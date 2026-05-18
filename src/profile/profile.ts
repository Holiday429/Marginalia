import { renderUnifiedPanelHeader, renderToolPageShell } from '../core/app.js';
import { logError, logEvent } from '../services/analytics.ts';
import { renderProfileSettings } from './profile-settings.ts';
import { ProfileMap } from './profile-map.ts';
import { ProfileAnnualShelf } from './profile-year-in-review.ts';
import { MarginaliaAuth } from '../firebase/auth.js';
import { ENV } from '../core/env.ts';
import { BooksStore } from '../store/books-store.ts';
import { DEMO_BOOKS, DEMO_PROFILE, DEMO_SEED_THRESHOLD, buildDemoHighlights, buildDemoSessionDays } from '../data/seed/profile-demo.ts';
import { loadAnnualShelf } from './annual-shelf-store.ts';
import { mountReadingIdentity } from './reading-identity.ts';
import type { PublicProfileData, PublicBook, PublicHighlight, SessionDay, DemoPayload } from './profile-types.ts';
import './profile.css';

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

    const books = realBooks.length >= DEMO_SEED_THRESHOLD
      ? realBooks
      : mergeDemoBooks(realBooks, DEMO_BOOKS);

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

function mergeDemoBooks(real: PublicBook[], demo: PublicBook[]): PublicBook[] {
  const ids = new Set(real.map((b) => b.id));
  return [...real, ...demo.filter((b) => !ids.has(b.id))];
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

function capitalizeWords(name: string): string {
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
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

  const header = profileHeaderHTML(showSettingsAction);

  const mapSection = profile.showMap ? `
    <section class="prof-section" aria-label="Reading journey">
      <div class="prof-section__head prof-section__head--stacked">
        <div>
          <h2 class="prof-section__title">Reading Journey</h2>
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
  const deskHighlights: PublicHighlight[] = [];

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
          <div class="prof-identity__card">
            <div class="prof-identity__media">${avatarEl}</div>
            <div class="prof-identity__copy">
              <h1 class="prof-name">${escapeHtml(displayName)}</h1>
              ${profile.slug ? `<p class="prof-slug">marginalia.app/#/p/${escapeHtml(profile.slug)}</p>` : ''}
              ${profile.bio ? `<p class="prof-bio">${escapeHtml(profile.bio)}</p>` : ''}
            </div>
          </div>
        </header>

        <section class="prof-section prof-section--identity" aria-label="Reading identity">
          <div class="prof-section__head prof-section__head--stacked">
            <div>
              <h2 class="prof-section__title">Reading Identity</h2>
            </div>
          </div>
          <div id="profIdentityMount"></div>
        </section>

        ${mapSection}
        ${annualSection}
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

  return {
    profile: DEMO_PROFILE,
    books,
    highlights: buildDemoHighlights(),
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
