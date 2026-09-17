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
