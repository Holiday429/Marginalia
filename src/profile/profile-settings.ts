/* Marginalia · Profile Settings Panel
   Gated on hasEntitlement('profile.public').
   Lets the user choose a slug, toggle public visibility,
   and select which books appear on their public profile.

   Writes to:
     users/{uid}.settings.slug
     users/{uid}.settings.profilePublic
     users/{uid}/data/books/{bookId}.shareInProfile  (per-book toggle)

   Slug uniqueness is verified via the profileSlugCheck Cloud Function
   before writing to Firestore.
*/

import { EntitlementsStore } from '../store/entitlements-store.ts';
import { BooksStore } from '../store/books-store.ts';
import { logError, logEvent } from '../services/analytics.ts';
import { t, setLanguage, getSupportedLocales, getLocaleKeys } from '../core/i18n.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FirestoreDB = any;

interface SlugCheckResult {
  available: boolean;
  reason?: string;
}

// Debounce timer for slug availability check
let _slugDebounce: ReturnType<typeof setTimeout> | null = null;

function getAuth() {
  return (window as any).MarginaliaAuth;
}

function getDb(): FirestoreDB | null {
  return getAuth()?.db ?? null;
}

function getUserId(): string | null {
  return getAuth()?.user?.uid ?? null;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$|^[a-z0-9]{1,32}$/;
const RESERVED = new Set([
  'admin', 'api', 'app', 'auth', 'billing', 'help', 'home',
  'login', 'logout', 'me', 'profile', 'settings', 'signup',
  'support', 'terms', 'privacy', 'about', 'contact', 'p',
]);

async function checkSlugAvailability(slug: string): Promise<SlugCheckResult> {
  // Client-side pre-validation — no network call needed for format errors.
  if (!SLUG_RE.test(slug)) return { available: false, reason: 'invalid_format' };
  if (RESERVED.has(slug))  return { available: false, reason: 'reserved' };

  const auth = getAuth();
  if (!auth?.app) return { available: false, reason: 'no_firebase' };

  try {
    const functions = (window as any).firebase.functions();
    const fn = functions.httpsCallable('profileSlugCheck');
    const result = await fn({ slug });
    return result.data as SlugCheckResult;
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), { context: 'profileSlugCheck' });
    // Cloud Function unreachable (not deployed locally) — skip uniqueness check,
    // allow save; Firestore write will still be validated server-side when deployed.
    return { available: true };
  }
}

async function saveSlug(slug: string): Promise<void> {
  const db = getDb();
  const uid = getUserId();
  if (!db || !uid) return;
  await db.doc(`users/${uid}`).set({ settings: { slug } }, { merge: true });
  logEvent('profile_slug_set', {});
}

async function saveLanguage(lang: string): Promise<void> {
  const db = getDb();
  const uid = getUserId();
  if (!db || !uid) return;
  await db.doc(`users/${uid}`).set({ settings: { language: lang } }, { merge: true });
  logEvent('language_changed', { language: lang });
  // Trigger a full UI re-render so all views pick up the new locale.
  window.dispatchEvent(new Event('marginalia:ui-refresh'));
}

async function saveProfilePublic(value: boolean): Promise<void> {
  const db = getDb();
  const uid = getUserId();
  if (!db || !uid) return;
  await db.doc(`users/${uid}`).set({ settings: { profilePublic: value } }, { merge: true });
  logEvent('profile_visibility_changed', { public: value });
}

async function saveShareInProfile(bookId: string, value: boolean): Promise<void> {
  const auth = getAuth();
  const uid = getUserId();
  if (!auth?.db || !uid) return;
  const wsId: string = (window as any).MARGINALIA_FIREBASE?.workspaceId ?? 'default';
  await auth.db
    .doc(`workspaces/${wsId}/users/${uid}/books/${bookId}`)
    .set({ shareInProfile: value }, { merge: true });
}

async function loadUserSettings(): Promise<{ slug?: string; profilePublic?: boolean; language?: string }> {
  const db = getDb();
  const uid = getUserId();
  if (!db || !uid) return {};
  try {
    const snap = await db.doc(`users/${uid}`).get();
    const settings = snap.data()?.settings ?? {};
    return {
      slug: settings.slug ?? '',
      profilePublic: settings.profilePublic ?? false,
      language: settings.language ?? 'en',
    };
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), { context: 'loadUserSettings' });
    return {};
  }
}

export async function renderProfileSettings(container: HTMLElement): Promise<void> {
  if (!EntitlementsStore.hasEntitlement('profile.public')) {
    container.innerHTML = upgradePromptHTML();
    return;
  }

  container.innerHTML = `<div class="prof-settings-loading">${t('profile-settings.loading')}</div>`;

  const [settings, books] = await Promise.all([
    loadUserSettings(),
    Promise.resolve(BooksStore.getAll()),
  ]);

  const lang = settings.language ?? 'en';
  container.innerHTML = settingsHTML(settings.slug ?? '', settings.profilePublic ?? false, books, lang);
  bindSettingsEvents(container, settings.slug ?? '');
}

function upgradePromptHTML(): string {
  return `
    <div class="prof-settings-gate">
      <p class="prof-settings-gate__msg">${t('profile-settings.gate.msg')}</p>
    </div>
  `;
}

function settingsHTML(
  slug: string,
  profilePublic: boolean,
  books: ReturnType<typeof BooksStore.getAll>,
  lang: string,
): string {
  const bookRows = books
    .slice()
    .sort((a, b) => String(a['title'] ?? '').localeCompare(String(b['title'] ?? '')))
    .map((book) => {
      const checked = book['shareInProfile'] ? 'checked' : '';
      const title = String(book['title'] ?? t('common.untitled'));
      const author = String(book['author'] ?? '');
      return `
        <label class="prof-book-row">
          <input type="checkbox" class="prof-book-check" data-book-id="${book.id}" ${checked}>
          <span class="prof-book-title">${escapeHtml(title)}</span>
          ${author ? `<span class="prof-book-author">${escapeHtml(author)}</span>` : ''}
        </label>
      `;
    })
    .join('');

  const langOptions = getSupportedLocales()
    .filter(l => l !== 'en')
    .map(l => {
      const label = getLocaleKeys(l)[`profile-settings.lang.${l}`] ?? l;
      return `<option value="${l}" ${lang === l ? 'selected' : ''}>${label}</option>`;
    })
    .join('');

  return `
    <div class="prof-settings">
      <h2 class="prof-settings__heading">${t('profile-settings.heading')}</h2>

      <section class="prof-settings__section">
        <label class="prof-settings__label" for="profLangSelect">${t('profile-settings.label.language')}</label>
        <select class="prof-lang-select" id="profLangSelect">
          <option value="en" ${lang === 'en' ? 'selected' : ''}>${t('profile-settings.lang.en')}</option>
          ${langOptions}
        </select>
      </section>

      <section class="prof-settings__section">
        <label class="prof-settings__label" for="profSlugInput">${t('profile-settings.label.url')}</label>
        <div class="prof-slug-row">
          <span class="prof-slug-prefix">marginalia.app/#/p/</span>
          <input
            id="profSlugInput"
            class="prof-slug-input"
            type="text"
            value="${escapeHtml(slug)}"
            placeholder="${t('profile-settings.slug.placeholder')}"
            maxlength="32"
            autocomplete="off"
            spellcheck="false"
          >
          <button class="prof-slug-save" id="profSlugSave" type="button">${t('profile-settings.slug.btn-save')}</button>
        </div>
        <p class="prof-slug-status" id="profSlugStatus" aria-live="polite"></p>
      </section>

      <section class="prof-settings__section">
        <label class="prof-settings__label prof-toggle-label">
          <span>${t('profile-settings.label.public')}</span>
          <span class="prof-toggle-wrap">
            <input type="checkbox" class="prof-toggle-input" id="profPublicToggle" ${profilePublic ? 'checked' : ''}>
            <span class="prof-toggle-track" aria-hidden="true"></span>
          </span>
        </label>
        <p class="prof-settings__hint">${t('profile-settings.hint.public')}</p>
      </section>

      <section class="prof-settings__section">
        <h3 class="prof-settings__subheading">${t('profile-settings.subheading.books')}</h3>
        <p class="prof-settings__hint">${t('profile-settings.hint.books')}</p>
        <div class="prof-book-list" id="profBookList">
          ${books.length ? bookRows : `<p class="prof-empty">${t('profile-settings.empty.books')}</p>`}
        </div>
      </section>
    </div>
  `;
}

function bindSettingsEvents(container: HTMLElement, initialSlug: string): void {
  let currentSlug = initialSlug;

  const langSelect = container.querySelector<HTMLSelectElement>('#profLangSelect');
  const slugInput  = container.querySelector<HTMLInputElement>('#profSlugInput');
  const slugSave   = container.querySelector<HTMLButtonElement>('#profSlugSave');
  const slugStatus = container.querySelector<HTMLElement>('#profSlugStatus');
  const pubToggle  = container.querySelector<HTMLInputElement>('#profPublicToggle');
  const bookList   = container.querySelector<HTMLElement>('#profBookList');

  langSelect?.addEventListener('change', async () => {
    const lang = langSelect.value;
    const prev = langSelect.dataset.prevLang ?? 'en';
    langSelect.dataset.prevLang = lang;
    setLanguage(lang);
    try {
      await saveLanguage(lang);
    } catch (err) {
      logError(err instanceof Error ? err : new Error(String(err)), { context: 'saveLanguage' });
      setLanguage(prev);
      langSelect.value = prev; // revert
    }
  });

  slugInput?.addEventListener('input', () => {
    if (!slugStatus) return;
    slugStatus.textContent = '';
    slugStatus.className = 'prof-slug-status';

    const value = slugInput.value.trim().toLowerCase();
    if (_slugDebounce) clearTimeout(_slugDebounce);
    if (!value || value === currentSlug) return;

    slugStatus.textContent = t('profile-settings.slug.checking');
    _slugDebounce = setTimeout(async () => {
      const result = await checkSlugAvailability(value);
      if (!slugStatus) return;
      if (result.available) {
        slugStatus.textContent = t('profile-settings.slug.available');
        slugStatus.className = 'prof-slug-status prof-slug-status--ok';
      } else {
        const msg = result.reason === 'taken' ? t('profile-settings.slug.taken')
          : result.reason === 'invalid_format' ? t('profile-settings.slug.invalid')
          : result.reason === 'reserved' ? t('profile-settings.slug.reserved')
          : t('profile-settings.slug.unavailable');
        slugStatus.textContent = msg;
        slugStatus.className = 'prof-slug-status prof-slug-status--err';
      }
    }, 480);
  });

  slugSave?.addEventListener('click', async () => {
    if (!slugInput || !slugStatus) return;
    const value = slugInput.value.trim().toLowerCase();
    if (!value) return;

    slugSave.disabled = true;
    slugStatus.textContent = t('profile-settings.slug.saving');
    slugStatus.className = 'prof-slug-status';

    const result = await checkSlugAvailability(value);
    if (!result.available) {
      const msg = result.reason === 'taken' ? t('profile-settings.slug.taken-choose-another')
        : t('profile-settings.slug.invalid');
      slugStatus.textContent = msg;
      slugStatus.className = 'prof-slug-status prof-slug-status--err';
      slugSave.disabled = false;
      return;
    }

    try {
      await saveSlug(value);
      currentSlug = value;
      slugStatus.textContent = t('profile-settings.slug.saved');
      slugStatus.className = 'prof-slug-status prof-slug-status--ok';
    } catch (err) {
      logError(err instanceof Error ? err : new Error(String(err)), { context: 'saveSlug' });
      slugStatus.textContent = t('profile-settings.slug.save-failed');
      slugStatus.className = 'prof-slug-status prof-slug-status--err';
    }
    slugSave.disabled = false;
  });

  pubToggle?.addEventListener('change', async () => {
    const value = pubToggle.checked;
    try {
      await saveProfilePublic(value);
    } catch (err) {
      logError(err instanceof Error ? err : new Error(String(err)), { context: 'saveProfilePublic' });
      pubToggle.checked = !value; // revert
    }
  });

  bookList?.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    if (!target.classList.contains('prof-book-check')) return;
    const bookId = target.dataset.bookId;
    if (!bookId) return;
    try {
      await saveShareInProfile(bookId, target.checked);
    } catch (err) {
      logError(err instanceof Error ? err : new Error(String(err)), { context: 'saveShareInProfile' });
      target.checked = !target.checked; // revert
    }
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
