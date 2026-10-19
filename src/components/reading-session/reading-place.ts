/* Marginalia · "where I read" at city level (plan 2.6)
   Optional, off unless the reader ticks the box beside Start, and only after the browser's own location
   permission prompt. Coordinates are rounded to two decimals (about a kilometre) here, sent once to the
   resolveReadingPlace function, and not kept anywhere: only the country and city name are stored, on the
   session and as the book's "reader anchor" place.
*/

import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from '../../firebase/config.ts';
import { MarginaliaBooksCloud } from '../../firebase/db.ts';
import { logError } from '../../services/analytics.ts';
import { BooksStore } from '../../store/books-store.ts';

export interface ReadingPlace { country: string; city: string | null }

const OPT_IN_KEY = 'marginalia:read-place-optin';

export function getPlaceOptIn(): boolean {
  try { return localStorage.getItem(OPT_IN_KEY) === '1'; } catch { return false; }
}

export function setPlaceOptIn(on: boolean): void {
  try { if (on) localStorage.setItem(OPT_IN_KEY, '1'); else localStorage.removeItem(OPT_IN_KEY); } catch { /* storage blocked: the choice lasts for this page view only */ }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Ask the browser for the position (this shows its permission prompt) and turn it into a city. Null when declined or unavailable. */
export async function captureReadingPlace(): Promise<ReadingPlace | null> {
  if (!navigator.geolocation || !firebaseFunctions) return null;
  const position = await new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 10_000, maximumAge: 600_000 });
  });
  if (!position) return null;
  try {
    const { data } = await httpsCallable<{ lat: number; lon: number }, { place: ReadingPlace | null }>(firebaseFunctions, 'resolveReadingPlace')({
      lat: round2(position.coords.latitude),
      lon: round2(position.coords.longitude),
    });
    return data.place;
  } catch (err) {
    logError(err, { context: 'captureReadingPlace' });
    return null;
  }
}

/** The book's reader-anchor place, unless the reader already has one for it. */
export async function rememberReadingPlace(bookId: string | null, place: ReadingPlace): Promise<void> {
  if (!bookId) return;
  const book = BooksStore.getById(bookId) as { geo?: Record<string, unknown> | null } | undefined;
  if (!book || (book.geo as { readerLocation?: unknown } | null | undefined)?.readerLocation) return;
  const geo = { ...(book.geo ?? {}), readerLocation: { country: place.country, ...(place.city ? { city: place.city } : {}) } };
  await MarginaliaBooksCloud.updateBook({ bookId, patch: { geo } });
  BooksStore.addOptimisticBook({ ...(book as object), geo } as never);
}
