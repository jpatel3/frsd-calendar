// lib.js — pure functions. No DOM, no network, no Date.now().

// ---------- rotation day + kind ----------
const ROTATION_NUMBERED = /^(?:[A-Z]{2,4}\s*-?\s*)?Day\s*(\d)(?:\s*\/\s*([AB]))?$/i;
const ROTATION_LETTER = /^([AB])\s+Day$/i;

export function isRotationDay(title) {
  const t = (title || '').trim();
  let m = t.match(ROTATION_NUMBERED);
  if (m) return m[2] ? `Day ${m[1]}/${m[2].toUpperCase()}` : `Day ${m[1]}`;
  m = t.match(ROTATION_LETTER);
  if (m) return `${m[1].toUpperCase()} Day`;
  return null;
}

export function classify(title) {
  const t = title || '';
  if (/school closed|no school/i.test(t)) return 'closed';
  if (/early dismissal/i.test(t)) return 'early';
  if (/delayed opening/i.test(t)) return 'delayed';
  return 'event';
}

// ---------- dates (YYYY-MM-DD strings; local NJ date taken from the API's offset string) ----------
export function dateOf(iso) { return String(iso).slice(0, 10); }
export function timeOf(iso) { return String(iso).slice(11, 16); }
export function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return formatDate(d); }
export function dayOfWeek(s) { return parseDate(s).getDay(); }
export function isWeekend(s) { const d = dayOfWeek(s); return d === 0 || d === 6; }
export function mondayOf(s) { const dow = dayOfWeek(s); return addDays(s, dow === 0 ? -6 : 1 - dow); }
export function weekRange(s) {
  const dow = dayOfWeek(s);
  const monday = dow === 0 ? addDays(s, 1) : dow === 6 ? addDays(s, 2) : mondayOf(s);
  const days = [0, 1, 2, 3, 4].map(i => addDays(monday, i));
  return { monday, friday: days[4], sunday: addDays(monday, 6), days };
}

// ---------- normalize + sort ----------
export function normalize(raw, schoolKey) {
  if (!raw || !raw.start_at) return [];
  const start = dateOf(raw.start_at);
  const endRaw = raw.end_at ? dateOf(raw.end_at) : start;
  const end = endRaw < start ? start : endRaw;
  const title = (raw.title || '').trim();
  const allDay = !!raw.all_day;
  const base = {
    id: raw.id, school: schoolKey, title, allDay,
    startTime: allDay ? null : timeOf(raw.start_at),
    endTime: allDay || !raw.end_at ? null : timeOf(raw.end_at),
    venue: (raw.venue || '').trim(),
    kind: classify(title),
    dayLabel: isRotationDay(title),
  };
  const out = [];
  for (let d = start, i = 0; d <= end && i < 60; d = addDays(d, 1), i++) out.push({ ...base, date: d });
  return out;
}

const KIND_ORDER = { closed: 0, delayed: 1, early: 2, event: 3 };
export function sortEvents(a, b) {
  if (!!a.dayLabel !== !!b.dayLabel) return a.dayLabel ? -1 : 1;
  if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const ta = a.startTime || '', tb = b.startTime || '';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.title.localeCompare(b.title);
}

// ---------- hash state + API url ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(s) {
  if (!s || !DATE_RE.test(s)) return null;
  return formatDate(parseDate(s)) === s ? s : null; // rejects 2026-13-40 (Date rolls over)
}

export function parseHash(hash, knownKeys) {
  const params = new URLSearchParams((hash || '').replace(/^#/, ''));
  const seen = new Set();
  const schools = (params.get('s') || '').split(',').map(k => k.trim())
    .filter(k => knownKeys.includes(k) && !seen.has(k) && seen.add(k));
  return { schools, view: params.get('v') === 'week' ? 'week' : 'today', date: validDate(params.get('d')) };
}

export function buildHash({ schools, view, date }, today) {
  const parts = [];
  if (schools.length) parts.push('s=' + schools.join(','));
  if (view === 'week') parts.push('v=week');
  if (date && date !== today) parts.push('d=' + date);
  return parts.length ? '#' + parts.join('&') : '';
}

export function buildEventsUrl(apiBase, school, startDate, endDate, page = 1) {
  return `${apiBase}/${school.org}/cms/events?section_ids=${school.section}&locale=en&start_date=${startDate}&end_date=${endDate}&page_no=${page}`;
}

// ---------- dedupe (feeds sometimes carry the same event twice) ----------
export function dedupe(list) {
  const seen = new Set();
  return list.filter(e => {
    const k = `${e.school}|${e.date}|${e.title.toLowerCase()}|${e.startTime || ''}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}
