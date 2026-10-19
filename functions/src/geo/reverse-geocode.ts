/* Marginalia · "where am I reading" at city level (plan 2.6).
   The browser sends the coordinates only after the reader allows location access; they are rounded to two
   decimals (about a kilometre) before they leave this function, looked up on OpenStreetMap's Nominatim, and
   thrown away. Only the country and the city name go back and are stored. */

export interface ReadingPlace { country: string; city: string | null }

export interface ReverseDeps {
  fetch: typeof fetch;
  baseUrl?: string;
  userAgent: string;
}

export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function reverseGeocode(lat: number, lon: number, deps: ReverseDeps): Promise<ReadingPlace | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const base = (deps.baseUrl ?? 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
  const params = new URLSearchParams({ format: 'jsonv2', zoom: '10', addressdetails: '1', 'accept-language': 'en', lat: String(roundCoordinate(lat)), lon: String(roundCoordinate(lon)) });
  const res = await deps.fetch(`${base}/reverse?${params.toString()}`, { headers: { 'User-Agent': deps.userAgent, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const json = (await res.json()) as { address?: Record<string, string> };
  const a = json.address ?? {};
  const country = String(a.country_code ?? '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return null;
  return { country, city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null };
}
