// data.js — fetching and caching. No DOM. Every localStorage access is guarded.
import { API_BASE, WEATHER } from './schools.js';
import { normalize, addDays, schoolYearRange, buildEventsUrl } from './lib.js';

const P = 'frsdcal.';
const H = 60 * 60 * 1000;
const TTL = { events: 6 * H, year: 24 * H, news: H / 2, weather: H, prune: 30 * 24 * H };

export const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  keys() { try { return Object.keys(localStorage); } catch { return []; } },
};

export function pruneCache() {
  const cutoff = Date.now() - TTL.prune;
  for (const k of store.keys()) {
    if (!k.startsWith(P + 'cache.') && !k.startsWith(P + 'year.') && !k.startsWith(P + 'news.')) continue;
    const v = store.get(k);
    if (!v || !v.fetchedAt || v.fetchedAt < cutoff) store.remove(k);
  }
}

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchAllPages(school, start, end) {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const json = await getJson(buildEventsUrl(API_BASE, school, start, end, page));
    out.push(...(json.events || []));
    if (!json.meta?.links?.next) break;
  }
  return out;
}

// Generic "fresh cache, else fetch, else stale cache" helper.
// Returns { data, fromCache, failed, fetchedAt }.
async function cached(key, ttl, fetcher) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.fetchedAt < ttl) return { data: hit.data, fromCache: false, failed: false, fetchedAt: hit.fetchedAt };
  try {
    const data = await fetcher();
    const fetchedAt = Date.now();
    store.set(key, { fetchedAt, data });
    return { data, fromCache: false, failed: false, fetchedAt };
  } catch (err) {
    console.warn('fetch failed', key, err);
    if (hit) return { data: hit.data, fromCache: true, failed: false, fetchedAt: hit.fetchedAt };
    return { data: null, fromCache: false, failed: true, fetchedAt: null };
  }
}

/** Events for one school for the Mon..Sun week starting `monday`. */
export function loadSchoolWeek(school, monday) {
  return cached(`${P}cache.${school.key}.${monday}`, TTL.events,
    async () => (await fetchAllPages(school, monday, addDays(monday, 6))).flatMap(r => normalize(r, school.key)));
}

/** All district events for the school year containing `today` (for countdowns). */
export function loadDistrictYear(district, today) {
  const { startYear, start, end } = schoolYearRange(today);
  return cached(`${P}year.${startYear}`, TTL.year,
    async () => (await fetchAllPages(district, start, end)).flatMap(r => normalize(r, district.key)));
}

/** Latest live-feed posts for one school (page 1 only). */
export function loadNews(school) {
  return cached(`${P}news.${school.key}`, TTL.news, async () => {
    const json = await getJson(`${API_BASE}/${school.org}/cms/live_feeds?section_ids=${school.feed}&locale=en&page_no=1`);
    return (json.live_feeds || []).map(p => ({
      id: p.id, school: school.key, at: p.publishing_at || p.time || '', ago: p.time_ago || '',
      html: p.status || '', urls: (p.expanded_urls || []).filter(u => /^https?:\/\//.test(u)),
    }));
  });
}

/** 7-day daily forecast for the configured town. Returns { [date]: { code, hi, lo, rain } }. */
export function loadWeather() {
  return cached(`${P}weather`, TTL.weather, async () => {
    const q = `latitude=${WEATHER.lat}&longitude=${WEATHER.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=7`;
    const j = await getJson(`https://api.open-meteo.com/v1/forecast?${q}`);
    const d = j.daily, out = {};
    d.time.forEach((t, i) => { out[t] = { code: d.weather_code[i], hi: Math.round(d.temperature_2m_max[i]), lo: Math.round(d.temperature_2m_min[i]), rain: d.precipitation_probability_max[i] }; });
    return out;
  });
}
