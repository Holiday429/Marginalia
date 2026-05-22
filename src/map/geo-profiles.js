/* ==========================================================================
   Marginalia · Geo-profile loader
   Fetches per-country literary context profiles from /data/geo-profiles/.
   Profiles are loaded on demand and cached for the session.
   ========================================================================== */

const BASE_URL = '/data/geo-profiles';

// Session-level cache: countryId → profile object (or null if fetch failed)
const _cache = new Map();

let _manifest = null;
let _manifestPromise = null;

async function loadManifest() {
  if (_manifest) return _manifest;
  if (_manifestPromise) return _manifestPromise;
  _manifestPromise = fetch(`${BASE_URL}/manifest.json`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      _manifest = data;
      return data;
    })
    .catch(() => null);
  return _manifestPromise;
}

function versionedUrl(countryId, manifest) {
  const v = manifest?.countries?.[countryId]?.v;
  const qs = v ? `?v=${v}` : '';
  return `${BASE_URL}/${countryId}.json${qs}`;
}

/**
 * Load a country profile. Returns the profile object, or null if unavailable.
 * Never throws — callers must handle a null result with a fallback.
 */
export async function loadProfile(countryId) {
  if (_cache.has(countryId)) return _cache.get(countryId);

  const manifest = await loadManifest();

  try {
    const url = versionedUrl(countryId, manifest);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const profile = await res.json();
    _cache.set(countryId, profile);
    return profile;
  } catch {
    _cache.set(countryId, null);
    return null;
  }
}

/**
 * Warm the cache for a list of country IDs in parallel.
 * Call this after the map boots to pre-fetch likely-to-be-clicked countries.
 */
export function prefetchProfiles(countryIds) {
  countryIds.forEach(id => loadProfile(id));
}

/**
 * Return a cached profile synchronously, or null if not yet loaded.
 * Use this only in synchronous render paths where async isn't possible.
 */
export function getCachedProfile(countryId) {
  return _cache.get(countryId) ?? null;
}

/**
 * Build the fallback context object used when no profile file exists.
 */
export function buildFallbackProfile(countryId, label) {
  return {
    countryId,
    countryName: label,
    hero: null,
    hover: {
      dna: ['国家形成', '地方经验', '语言层次'],
      voices: [],
      entry: {
        title: '先读一部地区小说',
        author: '',
        reason: `用人物关系进入 ${label} 的日常秩序与情感结构`,
      },
      cue: `${label} 目前还没有落入你的书单，但它依然适合作为"文化盲区入口"来读。先别急着找代表作，先问这个地区的语言、国家形成、宗教结构和城市经验怎样塑造了它的问题意识。`,
    },
    panel: {
      culture: `${label} 目前还没有落入你的书单，但它依然适合作为"文化盲区入口"来读。先别急着找代表作，先问这个地区的语言、国家形成、宗教结构和城市经验怎样塑造了它的问题意识。`,
      history: [
        `${label} 的阅读通常值得先补一条简短历史线：国家形成、殖民或战争经验、现代化节奏。`,
        `优先寻找能把地方日常和大结构连起来的作品：小说、回忆录、历史随笔通常比纯理论更好进入。`,
        `把它当成"语境训练"而不是知识清单，会更快建立阅读抓手。`,
      ],
      keywords: ['国家形成', '地方经验', '语言层次', '历史记忆', '宗教与世俗', '现代化节奏'],
      starters: [
        { title: '先读一部地区小说', author: '', year: null, note: `用人物关系进入 ${label} 的日常秩序与情感结构。`, type: 'Path 01', coverPath: '' },
        { title: '再补一本历史概述', author: '', year: null, note: `把 ${label} 的制度转型、战争或殖民线索串起来。`, type: 'Path 02', coverPath: '' },
        { title: '最后看回忆录或思想随笔', author: '', year: null, note: '让个人经验把抽象历史重新压回现实。', type: 'Path 03', coverPath: '' },
      ],
    },
  };
}
