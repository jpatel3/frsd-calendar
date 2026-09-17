import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHOOLS, SELECTABLE_KEYS } from '../schools.js';

test('schools config has exactly one always-on district entry', () => {
  assert.equal(SCHOOLS.filter(s => s.always).length, 1);
  assert.equal(SELECTABLE_KEYS.includes('frsd'), false);
  assert.equal(SELECTABLE_KEYS.length, 6);
});

import { readFileSync } from 'node:fs';
import { isRotationDay, classify, dateOf, timeOf, addDays, dayOfWeek, isWeekend, mondayOf, weekRange,
         formatDate, parseDate, normalize, sortEvents, parseHash, buildHash, buildEventsUrl } from '../lib.js';
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));
const KEYS = ['bs', 'ch', 'fad', 'rh', 'rfis', 'jpc'];

// ---- Task 2: rotation day + kind ----
test('isRotationDay recognizes every school format', () => {
  assert.equal(isRotationDay('CH -Day 4'), 'Day 4');
  assert.equal(isRotationDay('CH Day 1'), 'Day 1');
  assert.equal(isRotationDay('BS Day 6'), 'Day 6');
  assert.equal(isRotationDay('FAD-Day 2'), 'Day 2');
  assert.equal(isRotationDay('Day 2 '), 'Day 2');
  assert.equal(isRotationDay('RFIS Day 4/B'), 'Day 4/B');
  assert.equal(isRotationDay('rfis day 1 / a'), 'Day 1/A');
  assert.equal(isRotationDay('A Day'), 'A Day');
  assert.equal(isRotationDay('B Day'), 'B Day');
});

test('isRotationDay rejects lookalikes', () => {
  for (const t of ['Spirit Day', 'Labor Day - School Closed', 'CH-NEON/BRIGHT COLORS DAY',
                   'Bs- First Day of School', 'Field Day', 'Raritan Twp Community Day', '', undefined]) {
    assert.equal(isRotationDay(t), null, String(t));
  }
});

test('classify', () => {
  assert.equal(classify('FRSD-School Closed, Yom Kippur'), 'closed');
  assert.equal(classify('No School'), 'closed');
  assert.equal(classify('CH Early Dismissal - PreK-4 only'), 'early');
  assert.equal(classify('FRSD- 2 Hour Delayed Opening for Students only'), 'delayed');
  assert.equal(classify('Board of Education Meeting'), 'event');
});

// ---- Task 3: dates ----
test('dateOf/timeOf slice the ISO string without timezone math', () => {
  assert.equal(dateOf('2026-09-17T00:00:00.000-04:00'), '2026-09-17');
  assert.equal(timeOf('2026-09-23T18:30:00.000-04:00'), '18:30');
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-03-01', -1), '2027-02-28');
});

test('dayOfWeek / isWeekend', () => {
  assert.equal(dayOfWeek('2026-09-17'), 4);
  assert.equal(isWeekend('2026-09-19'), true);
  assert.equal(isWeekend('2026-09-21'), false);
});

test('mondayOf uses the calendar week containing the date', () => {
  assert.equal(mondayOf('2026-09-17'), '2026-09-14');
  assert.equal(mondayOf('2026-09-14'), '2026-09-14');
  assert.equal(mondayOf('2026-09-20'), '2026-09-14');
});

test('weekRange rolls weekends forward to the upcoming week', () => {
  assert.deepEqual(weekRange('2026-09-17').days, ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']);
  assert.equal(weekRange('2026-09-19').monday, '2026-09-21');
  assert.equal(weekRange('2026-09-20').monday, '2026-09-21');
  assert.equal(weekRange('2026-09-17').friday, '2026-09-18');
  assert.equal(weekRange('2026-09-17').sunday, '2026-09-20');
});

test('formatDate/parseDate round trip', () => {
  assert.equal(formatDate(parseDate('2026-01-05')), '2026-01-05');
});

// ---- Task 4: normalize + sort ----
test('normalize maps a fixture rotation-day event', () => {
  const raw = fixture('ch').events.find(e => e.title === 'CH -Day 4');
  const [ev] = normalize(raw, 'ch');
  assert.deepEqual(ev, { id: raw.id, school: 'ch', title: 'CH -Day 4', date: '2026-09-17', allDay: true,
    startTime: null, endTime: null, venue: '', kind: 'event', dayLabel: 'Day 4' });
});

test('normalize keeps times for timed events and trims venue', () => {
  const [ev] = normalize({ id: 1, title: ' BOE Meeting ', start_at: '2026-09-23T19:00:00.000-04:00',
    end_at: '2026-09-23T21:00:00.000-04:00', all_day: false, venue: ' Admin Bldg ' }, 'frsd');
  assert.equal(ev.title, 'BOE Meeting'); assert.equal(ev.startTime, '19:00');
  assert.equal(ev.endTime, '21:00'); assert.equal(ev.venue, 'Admin Bldg'); assert.equal(ev.allDay, false);
});

test('normalize expands multi-day events to one entry per day', () => {
  const out = normalize({ id: 2, title: 'Book Fair', start_at: '2026-10-05T00:00:00.000-04:00',
    end_at: '2026-10-08T00:00:00.000-04:00', all_day: true }, 'rfis');
  assert.deepEqual(out.map(e => e.date), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
});

test('normalize skips malformed and tolerates end before start', () => {
  assert.deepEqual(normalize({ id: 3, title: 'x' }, 'ch'), []);
  assert.deepEqual(normalize(null, 'ch'), []);
  assert.equal(normalize({ id: 4, title: 'x', start_at: '2026-10-05T00:00:00.000-04:00', end_at: '2026-10-01T00:00:00.000-04:00' }, 'ch').length, 1);
});

test('every fixture event normalizes to at least one entry', () => {
  for (const name of ['ch', 'rfis', 'jpc', 'frsd']) {
    for (const raw of fixture(name).events) assert.ok(normalize(raw, name).length >= 1, raw.title);
  }
});

test('sortEvents: rotation day, then closed/delayed/early, then all-day, then by time', () => {
  const mk = (o) => ({ id: 0, school: 'x', title: 'T', date: '2026-09-17', allDay: true, startTime: null, endTime: null, venue: '', kind: 'event', dayLabel: null, ...o });
  const list = [
    mk({ title: 'timed late', allDay: false, startTime: '18:00' }),
    mk({ title: 'plain all-day' }),
    mk({ title: 'timed early', allDay: false, startTime: '09:00' }),
    mk({ title: 'Early Dismissal', kind: 'early' }),
    mk({ title: 'Day 4', dayLabel: 'Day 4' }),
    mk({ title: 'School Closed', kind: 'closed' }),
  ].sort(sortEvents).map(e => e.title);
  assert.deepEqual(list, ['Day 4', 'School Closed', 'Early Dismissal', 'plain all-day', 'timed early', 'timed late']);
});

// ---- Task 5: hash + url ----
test('parseHash reads schools, view, date and drops unknowns', () => {
  assert.deepEqual(parseHash('#s=ch,rfis,bogus,ch&v=week&d=2026-09-21', KEYS),
    { schools: ['ch', 'rfis'], view: 'week', date: '2026-09-21' });
  assert.deepEqual(parseHash('#s=ch%2Crfis', KEYS), { schools: ['ch', 'rfis'], view: 'today', date: null });
  assert.deepEqual(parseHash('', KEYS), { schools: [], view: 'today', date: null });
  assert.deepEqual(parseHash('#v=month&d=nope', KEYS), { schools: [], view: 'today', date: null });
  assert.equal(parseHash('#d=2026-13-40', KEYS).date, null);
});

test('buildHash omits defaults and keeps commas readable', () => {
  assert.equal(buildHash({ schools: ['ch', 'rfis'], view: 'today', date: '2026-09-17' }, '2026-09-17'), '#s=ch,rfis');
  assert.equal(buildHash({ schools: ['ch'], view: 'week', date: '2026-09-21' }, '2026-09-17'), '#s=ch&v=week&d=2026-09-21');
  assert.equal(buildHash({ schools: [], view: 'today', date: '2026-09-17' }, '2026-09-17'), '');
});

test('buildEventsUrl', () => {
  const s = { org: 27225, section: 460569 };
  assert.equal(buildEventsUrl('https://x/api/v4/o', s, '2026-09-14', '2026-09-20'),
    'https://x/api/v4/o/27225/cms/events?section_ids=460569&locale=en&start_date=2026-09-14&end_date=2026-09-20&page_no=1');
  assert.ok(buildEventsUrl('https://x/api/v4/o', s, '2026-09-14', '2026-09-20', 3).endsWith('page_no=3'));
});

// ---- dedupe ----
import { dedupe } from '../lib.js';
test('dedupe drops same school+date+title+time, keeps the rest', () => {
  const mk = (o) => ({ id: 0, school: 'ch', title: 'CH-PICTURE DAY', date: '2026-09-23', allDay: true, startTime: null, endTime: null, venue: '', kind: 'event', dayLabel: null, ...o });
  const out = dedupe([mk({ id: 1 }), mk({ id: 2 }), mk({ id: 3, date: '2026-09-24' }), mk({ id: 4, school: 'rfis' }), mk({ id: 5, allDay: false, startTime: '09:00' })]);
  assert.deepEqual(out.map(e => e.id), [1, 3, 4, 5]);
});

// ================= v2 =================
import { emojiFor, weatherEmoji, funLine, schoolYearRange, schoolDaysBetween, nextDayOff, nextBreak,
         cleanDistrictTitle, shareUrl } from '../lib.js';

test('emojiFor: kind wins, then keywords, else empty', () => {
  assert.equal(emojiFor('FRSD-School Closed, Yom Kippur', 'closed'), '🏠');
  assert.equal(emojiFor('RFIS - Early Dismissal (12:40 p.m.)', 'early'), '⏰');
  assert.equal(emojiFor('FRSD- 2 Hour Delayed Opening', 'delayed'), '🕘');
  assert.equal(emojiFor('CH-PICTURE DAY', 'event'), '📸');
  assert.equal(emojiFor('RFIS Book Fair', 'event'), '📚');
  assert.equal(emojiFor('CH-NEON/BRIGHT COLORS DAY', 'event'), '🎉');
  assert.equal(emojiFor('JPC - Back To School Night', 'event'), '🌙');
  assert.equal(emojiFor('Board of Education Meeting', 'event'), '🏛️');
  assert.equal(emojiFor('CH - ICE POP SOCIAL', 'event'), '🍦');
  assert.equal(emojiFor('MAP Growth Assessment Fall Window', 'event'), '✏️');
  assert.equal(emojiFor('RFIS Fall Husky Hangouts Begin', 'event'), '🏅');
  assert.equal(emojiFor('Netta Alvarez - Law Guardian to visit IU', 'event'), '');
});

test('weatherEmoji maps WMO codes', () => {
  assert.equal(weatherEmoji(0), '☀️'); assert.equal(weatherEmoji(2), '🌤️'); assert.equal(weatherEmoji(3), '☁️');
  assert.equal(weatherEmoji(45), '🌫️'); assert.equal(weatherEmoji(53), '🌦️'); assert.equal(weatherEmoji(63), '🌧️');
  assert.equal(weatherEmoji(73), '❄️'); assert.equal(weatherEmoji(81), '🌧️'); assert.equal(weatherEmoji(86), '🌨️');
  assert.equal(weatherEmoji(95), '⛈️'); assert.equal(weatherEmoji(undefined), '');
});

test('funLine is deterministic per date and non-empty', () => {
  assert.equal(funLine('2026-09-19'), funLine('2026-09-19'));
  assert.ok(funLine('2026-09-19').length > 5);
  const distinct = new Set(['2026-09-19', '2026-09-20', '2026-09-26', '2026-10-03', '2026-10-10'].map(funLine));
  assert.ok(distinct.size >= 2);
});

test('schoolYearRange spans Aug 1 to Jul 31 of the right year', () => {
  assert.deepEqual(schoolYearRange('2026-09-17'), { startYear: 2026, start: '2026-08-01', end: '2027-07-31' });
  assert.deepEqual(schoolYearRange('2027-03-01'), { startYear: 2026, start: '2026-08-01', end: '2027-07-31' });
  assert.deepEqual(schoolYearRange('2027-08-15'), { startYear: 2027, start: '2027-08-01', end: '2028-07-31' });
});

test('schoolDaysBetween counts weekdays strictly between, minus closed days', () => {
  assert.equal(schoolDaysBetween('2026-09-17', '2026-09-21', new Set()), 1);            // Fri 18 only
  assert.equal(schoolDaysBetween('2026-09-17', '2026-09-28', new Set(['2026-09-21'])), 5); // 18,22,23,24,25
  assert.equal(schoolDaysBetween('2026-09-17', '2026-09-18', new Set()), 0);
});

test('cleanDistrictTitle strips FRSD and School Closed boilerplate', () => {
  assert.equal(cleanDistrictTitle('FRSD-School Closed, Yom Kippur'), 'Yom Kippur');
  assert.equal(cleanDistrictTitle('FRSD-School Closed - Staff In-Service or Contingency #1'), 'Staff In-Service or Contingency #1');
  assert.equal(cleanDistrictTitle('FRSD-School Closed, Thanksgiving Recess'), 'Thanksgiving Recess');
  assert.equal(cleanDistrictTitle('FRSD- 2 Hour Delayed Opening for Students only'), '2 Hour Delayed Opening for Students only');
  assert.equal(cleanDistrictTitle('Board of Education Meeting'), 'Board of Education Meeting');
});

const yr = [
  { date: '2026-09-21', kind: 'closed', title: 'FRSD-School Closed, Yom Kippur' },
  { date: '2026-10-13', kind: 'early', title: 'FRSD-Early Dismissal, Staff In-Service' },
  { date: '2026-11-03', kind: 'closed', title: 'FRSD-School Closed, Staff In-Service' },
  { date: '2026-11-05', kind: 'closed', title: 'FRSD-School Closed, NJEA Convention' },
  { date: '2026-11-26', kind: 'closed', title: 'FRSD-School Closed, Thanksgiving Recess' },
  { date: '2026-11-27', kind: 'closed', title: 'FRSD-School Closed, Thanksgiving Recess' },
  { date: '2026-12-24', kind: 'closed', title: 'FRSD-School Closed - Winter Recess' },
  { date: '2027-06-18', kind: 'early', title: 'FRSD-Early Dismissal – Last Day of School' },
].map(e => ({ id: 0, school: 'frsd', allDay: true, startTime: null, endTime: null, venue: '', dayLabel: null, ...e }));

test('nextDayOff finds the next weekday closure and counts school days', () => {
  assert.deepEqual(nextDayOff(yr, '2026-09-17'), { date: '2026-09-21', title: 'Yom Kippur', schoolDays: 1 });
  assert.deepEqual(nextDayOff(yr, '2026-09-21'), { date: '2026-11-03', title: 'Staff In-Service', schoolDays: 30 });
  assert.equal(nextDayOff(yr, '2027-06-20'), null);
});

test('nextBreak finds the next recess start, then last day of school', () => {
  const b = nextBreak(yr, '2026-09-17');
  assert.equal(b.date, '2026-11-26'); assert.equal(b.title, 'Thanksgiving Recess'); assert.equal(b.emoji, '🦃');
  assert.equal(nextBreak(yr, '2026-11-27').title, 'Winter Recess');
  assert.equal(nextBreak(yr, '2026-11-27').emoji, '🎄');
  const last = nextBreak(yr, '2027-01-05');
  assert.equal(last.date, '2027-06-18'); assert.equal(last.title, 'Last Day of School'); assert.equal(last.emoji, '🎓');
  assert.equal(nextBreak(yr, '2027-06-20'), null);
});

test('shareUrl carries schools and view but never the date', () => {
  assert.equal(shareUrl('https://x.github.io/frsd-calendar/', { schools: ['ch', 'rfis'], view: 'week', date: '2026-09-21' }),
    'https://x.github.io/frsd-calendar/#s=ch,rfis&v=week');
  assert.equal(shareUrl('https://x/', { schools: [], view: 'today', date: '2026-09-21' }), 'https://x/');
});
