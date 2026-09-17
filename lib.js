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

// ================= v2 =================

// ---------- emoji ----------
const KIND_EMOJI = { closed: '🏠', early: '⏰', delayed: '🕘' };
const EMOJI_RULES = [
  [/picture/i, '📸'], [/book fair|library/i, '📚'],
  [/spirit|dress|pajama|neon|colou?r|\bhat\b|crazy|wacky/i, '🎉'],
  [/back[- ]to[- ]school night|b2sn/i, '🌙'], [/field trip/i, '🚌'], [/conference/i, '🗣️'],
  [/\bpto\b/i, '🤝'], [/board of education|\bboe\b/i, '🏛️'],
  [/concert|\bband\b|chorus|choir|music/i, '🎵'], [/first day/i, '🎒'], [/last day/i, '🎓'],
  [/ice cream|ice pop|social/i, '🍦'], [/dine out|fundrais|restaurant night/i, '🍕'],
  [/trimester|report card|progress report/i, '📝'], [/assessment|map growth|njsla|\btest(ing)?\b/i, '✏️'],
  [/halloween|trunk or treat/i, '🎃'], [/valentine/i, '💝'], [/100th day/i, '💯'],
  [/science/i, '🔬'], [/\bart\b|artist/i, '🎨'], [/sports?|\bgame\b|\bmeet\b|husky|athletic/i, '🏅'],
  [/clothing drive|\bdrive\b|donation/i, '📦'],
];
export function emojiFor(title, kind) {
  if (KIND_EMOJI[kind]) return KIND_EMOJI[kind];
  const t = title || '';
  for (const [re, e] of EMOJI_RULES) if (re.test(t)) return e;
  return '';
}

// ---------- weather (WMO codes) ----------
export function weatherEmoji(code) {
  if (code == null) return '';
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '🌨️';
  return '⛈️';
}

// ---------- fun ----------
const FUN_LINES = [
  'Sleep in. You earned it.', 'Pancakes are a valid plan.', 'Homework can wait. Probably.',
  'Perfect day for a bike ride.', 'Library trip? Library trip.', 'Pajamas until noon is allowed.',
  'Someone said pillow fort.', 'Board game tournament, anyone?', 'Go find a playground.',
  'Bake something. Eat the evidence.',
];
export function funLine(dateStr) {
  let h = 0;
  for (const c of String(dateStr)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FUN_LINES[h % FUN_LINES.length];
}

// ---------- countdown ----------
export function schoolYearRange(today) {
  const [y, m] = today.split('-').map(Number);
  const startYear = m >= 8 ? y : y - 1;
  return { startYear, start: `${startYear}-08-01`, end: `${startYear + 1}-07-31` };
}

export function schoolDaysBetween(from, to, closedDates) {
  let n = 0;
  for (let d = addDays(from, 1); d < to; d = addDays(d, 1)) {
    if (!isWeekend(d) && !closedDates.has(d)) n++;
  }
  return n;
}

export function cleanDistrictTitle(title) {
  return String(title || '').trim()
    .replace(/^FRSD\s*[-–—:]?\s*/i, '')
    .replace(/^School Closed\s*[-–—,:]?\s*/i, '')
    .trim();
}

const closedDatesOf = events => new Set(events.filter(e => e.kind === 'closed').map(e => e.date));
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export function nextDayOff(events, today) {
  const closed = closedDatesOf(events);
  const next = events.filter(e => e.kind === 'closed' && e.date > today && !isWeekend(e.date)).sort(byDate)[0];
  if (!next) return null;
  return { date: next.date, title: cleanDistrictTitle(next.title), schoolDays: schoolDaysBetween(today, next.date, closed) };
}

function breakEmoji(title) {
  if (/thanksgiving/i.test(title)) return '🦃';
  if (/winter|holiday/i.test(title)) return '🎄';
  if (/spring/i.test(title)) return '🌸';
  if (/last day/i.test(title)) return '🎓';
  return '🏖️';
}

export function nextBreak(events, today) {
  const closed = closedDatesOf(events);
  const recess = events.filter(e => e.kind === 'closed' && e.date > today && /recess|break/i.test(e.title)).sort(byDate)[0];
  const pick = recess || events.filter(e => e.date > today && /last day of school/i.test(e.title)).sort(byDate)[0];
  if (!pick) return null;
  const title = recess ? cleanDistrictTitle(pick.title) : 'Last Day of School';
  return { date: pick.date, title, emoji: breakEmoji(title), schoolDays: schoolDaysBetween(today, pick.date, closed) };
}

// ---------- share ----------
export function shareUrl(base, { schools, view }) {
  return base + buildHash({ schools, view, date: null }, null);
}
