# FRSD Family Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static one-page app on GitHub Pages that shows a combined Today or Week view of FRSD school events and rotation days for any set of selected schools.

**Architecture:** Plain HTML/CSS/ES-module JS, no build. `lib.js` holds pure functions (parsing, dates, normalize, hash) tested with `node --test`. `app.js` owns state, fetches the public Thrillshare events API per school-week with a localStorage cache, and renders the two views into `index.html`. `schools.js` is the only config file.

**Tech Stack:** Vanilla JS (ES2022 modules), CSS, Node 20+ built-in test runner for unit tests. No dependencies.

**Spec:** `docs/superpowers/specs/2026-09-17-frsd-calendar-design.md`

## Global Constraints

- No build step, no npm dependencies, no framework. Files served as-is by GitHub Pages.
- Node 20+ only for running tests (`node --test test/`).
- API base: `https://thrillshare-cmsv2.services.thrillshare.com/api/v4/o`
- Dates are handled as `YYYY-MM-DD` strings taken from the API's ISO offset string (`start_at.slice(0,10)`), never via `new Date(iso)`, so users in other time zones see the New Jersey date.
- District (`frsd`) is always included in the data fetch and is not a selectable chip.
- URL hash format: `#s=ch,rfis&v=week&d=2026-09-21` (`v` and `d` optional).
- localStorage keys: `frsdcal.schools`, `frsdcal.cache.{key}.{monday}`. Cache TTL 6 h, prune > 30 days. Every localStorage access wrapped in try/catch.
- Page must work at 400px wide.
- Commit after every task with the Co-Authored-By line from the session.

---

## File structure

```
index.html      shell: header (title, chips, view toggle, nav), <main>, footer
styles.css      tokens, layout, chips, cards, week grid, kind styles, responsive
schools.js      SCHOOLS table, API_BASE, PDF_URL, REPO_URL  (config only)
lib.js          pure: isRotationDay, classify, dateOf, timeOf, formatDate, parseDate,
                addDays, dayOfWeek, isWeekend, mondayOf, weekRange, normalize,
                sortEvents, parseHash, buildHash, buildEventsUrl
app.js          state, storage, fetch+cache, render today/week, event wiring
test/lib.test.mjs          unit tests for lib.js
test/fixtures/*.json       one API page each: ch, rfis, jpc, frsd (week of 2026-09-14)
README.md, .nojekyll
```

---

### Task 1: Scaffold, config, fixtures, test harness

**Files:**
- Create: `schools.js`, `.nojekyll`, `.gitignore`, `test/fixtures/{ch,rfis,jpc,frsd}.json`, `test/lib.test.mjs` (smoke only)

**Interfaces:**
- Produces: `SCHOOLS` array of `{ key, name, short, grades, org, section, color, slug, always? }`; `API_BASE`, `PDF_URL`, `REPO_URL` strings; `SELECTABLE_KEYS` array.

- [ ] **Step 1: Write schools.js**

```js
// schools.js — the only file another FRSD parent (or another Apptegy district) needs to edit.
export const API_BASE = 'https://thrillshare-cmsv2.services.thrillshare.com/api/v4/o';
export const SITE_BASE = 'https://www.frsd.us/o';
export const PDF_URL = 'https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/5380/Fr/4e4d5051-45e3-48c5-b450-da0e963cc770/2026-2027-District-Calendar-FINAL.pdf?disposition=inline';
export const REPO_URL = 'https://github.com/'; // set after creating the repo

export const SCHOOLS = [
  { key: 'frsd', name: 'District', short: 'FRSD', grades: '', org: 27053, section: 457011, slug: 'frs', color: '#4b5563', always: true },
  { key: 'bs',   name: 'Barley Sheaf School', short: 'BS', grades: 'PreK-4', org: 27224, section: 460560, slug: 'bs', color: '#b45309' },
  { key: 'ch',   name: 'Copper Hill School', short: 'CH', grades: 'PreK-4', org: 27225, section: 460569, slug: 'ch', color: '#1d4ed8' },
  { key: 'fad',  name: 'Francis A. Desmares School', short: 'FAD', grades: 'PreK-4', org: 27226, section: 460578, slug: 'fad', color: '#15803d' },
  { key: 'rh',   name: 'Robert Hunter School', short: 'RH', grades: 'PreK-4', org: 27229, section: 460606, slug: 'rh', color: '#7e22ce' },
  { key: 'rfis', name: 'Reading-Fleming Intermediate School', short: 'RFIS', grades: '5-6', org: 27228, section: 460597, slug: 'rfis', color: '#b91c1c' },
  { key: 'jpc',  name: 'J.P. Case Middle School', short: 'JPC', grades: '7-8', org: 27227, section: 460587, slug: 'jpc', color: '#0e7490' },
];

export const SELECTABLE_KEYS = SCHOOLS.filter(s => !s.always).map(s => s.key);
```

- [ ] **Step 2: Capture fixtures from the live API**

```bash
mkdir -p test/fixtures
A=https://thrillshare-cmsv2.services.thrillshare.com/api/v4/o
curl -s "$A/27225/cms/events?section_ids=460569&locale=en&start_date=2026-09-14&end_date=2026-09-20&page_no=1" > test/fixtures/ch.json
curl -s "$A/27228/cms/events?section_ids=460597&locale=en&start_date=2026-09-14&end_date=2026-09-20&page_no=1" > test/fixtures/rfis.json
curl -s "$A/27227/cms/events?section_ids=460587&locale=en&start_date=2026-09-14&end_date=2026-09-20&page_no=1" > test/fixtures/jpc.json
curl -s "$A/27053/cms/events?section_ids=457011&locale=en&start_date=2026-09-14&end_date=2026-09-27&page_no=1" > test/fixtures/frsd.json
```
Expected: each file is JSON with `events` and `meta` keys.

- [ ] **Step 3: Smoke test + misc files**

`test/lib.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHOOLS, SELECTABLE_KEYS } from '../schools.js';

test('schools config has exactly one always-on district entry', () => {
  assert.equal(SCHOOLS.filter(s => s.always).length, 1);
  assert.equal(SELECTABLE_KEYS.includes('frsd'), false);
  assert.equal(SELECTABLE_KEYS.length, 6);
});
```
`.nojekyll`: empty file. `.gitignore`: `.DS_Store`.

- [ ] **Step 4: Run** `node --test test/` → 1 pass.
- [ ] **Step 5: Commit** `feat: scaffold config, fixtures, test harness`

---

### Task 2: lib.js — rotation day and kind detection

**Files:** Create `lib.js`; Modify `test/lib.test.mjs`

**Interfaces:**
- Produces: `isRotationDay(title: string): string|null` returns `"Day 4"`, `"Day 4/B"`, `"A Day"` or null. `classify(title): 'closed'|'early'|'delayed'|'event'`.

- [ ] **Step 1: Failing tests**

```js
import { isRotationDay, classify } from '../lib.js';

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
    assert.equal(isRotationDay(t), null, t);
  }
});

test('classify', () => {
  assert.equal(classify('FRSD-School Closed, Yom Kippur'), 'closed');
  assert.equal(classify('No School'), 'closed');
  assert.equal(classify('CH Early Dismissal - PreK-4 only'), 'early');
  assert.equal(classify('FRSD- 2 Hour Delayed Opening for Students only'), 'delayed');
  assert.equal(classify('Board of Education Meeting'), 'event');
});
```

- [ ] **Step 2: Run** → FAIL (module not found).
- [ ] **Step 3: Implement**

```js
// lib.js — pure functions. No DOM, no network, no Date.now().
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
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(lib): rotation day and kind detection`

---

### Task 3: lib.js — date helpers

**Interfaces:**
- Produces: `dateOf(iso)`, `timeOf(iso)`, `formatDate(Date)`, `parseDate(str): Date`, `addDays(str, n)`, `dayOfWeek(str)` (0=Sun), `isWeekend(str)`, `mondayOf(str)` (calendar week Mon), `weekRange(str): { monday, friday, sunday, days: string[5] }` (weekend rolls forward).

- [ ] **Step 1: Failing tests**

```js
import { dateOf, timeOf, addDays, dayOfWeek, isWeekend, mondayOf, weekRange, formatDate, parseDate } from '../lib.js';

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
  assert.equal(dayOfWeek('2026-09-17'), 4); // Thursday
  assert.equal(isWeekend('2026-09-19'), true);
  assert.equal(isWeekend('2026-09-21'), false);
});

test('mondayOf uses the calendar week containing the date', () => {
  assert.equal(mondayOf('2026-09-17'), '2026-09-14');
  assert.equal(mondayOf('2026-09-14'), '2026-09-14');
  assert.equal(mondayOf('2026-09-20'), '2026-09-14'); // Sunday belongs to prior Monday
});

test('weekRange rolls weekends forward to the upcoming week', () => {
  assert.deepEqual(weekRange('2026-09-17').days, ['2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18']);
  assert.equal(weekRange('2026-09-19').monday, '2026-09-21'); // Saturday
  assert.equal(weekRange('2026-09-20').monday, '2026-09-21'); // Sunday
  assert.equal(weekRange('2026-09-17').friday, '2026-09-18');
  assert.equal(weekRange('2026-09-17').sunday, '2026-09-20');
});

test('formatDate/parseDate round trip', () => {
  assert.equal(formatDate(parseDate('2026-01-05')), '2026-01-05');
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (append to lib.js)

```js
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
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(lib): date helpers`

---

### Task 4: lib.js — normalize and sortEvents

**Interfaces:**
- Produces: `normalize(raw, schoolKey): NormalizedEvent[]` where `NormalizedEvent = { id, school, title, date, allDay, startTime, endTime, venue, kind, dayLabel }`; `sortEvents(a, b): number`.

- [ ] **Step 1: Failing tests**

```js
import { readFileSync } from 'node:fs';
import { normalize, sortEvents } from '../lib.js';
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));

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
  assert.deepEqual(out.map(e => e.date), ['2026-10-05','2026-10-06','2026-10-07','2026-10-08']);
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
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (append)

```js
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
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(lib): normalize and sortEvents`

---

### Task 5: lib.js — hash state and API URL

**Interfaces:**
- Produces: `parseHash(hash, knownKeys): { schools: string[], view: 'today'|'week', date: string|null }`; `buildHash({schools, view, date}, today): string` (empty string when nothing to encode); `buildEventsUrl(apiBase, school, startDate, endDate, page=1): string`.

- [ ] **Step 1: Failing tests**

```js
import { parseHash, buildHash, buildEventsUrl } from '../lib.js';
const KEYS = ['bs','ch','fad','rh','rfis','jpc'];

test('parseHash reads schools, view, date and drops unknowns', () => {
  assert.deepEqual(parseHash('#s=ch,rfis,bogus,ch&v=week&d=2026-09-21', KEYS),
    { schools: ['ch','rfis'], view: 'week', date: '2026-09-21' });
  assert.deepEqual(parseHash('#s=ch%2Crfis', KEYS), { schools: ['ch','rfis'], view: 'today', date: null });
  assert.deepEqual(parseHash('', KEYS), { schools: [], view: 'today', date: null });
  assert.deepEqual(parseHash('#v=month&d=nope', KEYS), { schools: [], view: 'today', date: null });
  assert.equal(parseHash('#d=2026-13-40', KEYS).date, null);
});

test('buildHash omits defaults and keeps commas readable', () => {
  assert.equal(buildHash({ schools: ['ch','rfis'], view: 'today', date: '2026-09-17' }, '2026-09-17'), '#s=ch,rfis');
  assert.equal(buildHash({ schools: ['ch'], view: 'week', date: '2026-09-21' }, '2026-09-17'), '#s=ch&v=week&d=2026-09-21');
  assert.equal(buildHash({ schools: [], view: 'today', date: '2026-09-17' }, '2026-09-17'), '');
});

test('buildEventsUrl', () => {
  const s = { org: 27225, section: 460569 };
  assert.equal(buildEventsUrl('https://x/api/v4/o', s, '2026-09-14', '2026-09-20'),
    'https://x/api/v4/o/27225/cms/events?section_ids=460569&locale=en&start_date=2026-09-14&end_date=2026-09-20&page_no=1');
  assert.ok(buildEventsUrl('https://x/api/v4/o', s, '2026-09-14', '2026-09-20', 3).endsWith('page_no=3'));
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (append)

```js
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(s) {
  if (!s || !DATE_RE.test(s)) return null;
  const d = parseDate(s);
  return formatDate(d) === s ? s : null; // rejects 2026-13-40 (Date rolls over)
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
```
- [ ] **Step 4: Run** → all PASS. **Step 5: Commit** `feat(lib): hash state and API url`

---

### Task 6: Shell, styles, and app state with chips (no data yet)

**Files:** Create `index.html`, `styles.css`, `app.js`

**Interfaces:**
- Consumes everything from `lib.js` and `schools.js`.
- Produces: `app.js` module with `state = { schools, view, date }`, `setState(patch)`, `render()`; DOM ids `#chips`, `#view-today`, `#view-week`, `#nav-prev`, `#nav-next`, `#nav-today`, `#range-label`, `#main`, `#status`.

- [ ] **Step 1: index.html**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>FRSD Family Calendar</title>
<meta name="description" content="Combined today / week view of Flemington-Raritan school events and rotation days for the schools you pick.">
<link rel="stylesheet" href="styles.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📅</text></svg>">
</head>
<body>
<header class="top">
  <div class="brand">
    <h1>FRSD Family Calendar</h1>
    <p class="tagline">Pick your kids' schools. See today or this week, together.</p>
  </div>
  <div id="chips" class="chips" role="group" aria-label="Schools"></div>
  <div class="controls">
    <div class="seg" role="group" aria-label="View">
      <button id="view-today" type="button" aria-pressed="true">Today</button>
      <button id="view-week" type="button" aria-pressed="false">Week</button>
    </div>
    <div class="nav">
      <button id="nav-prev" type="button" aria-label="Previous">‹</button>
      <button id="nav-today" type="button">Today</button>
      <button id="nav-next" type="button" aria-label="Next">›</button>
    </div>
    <div id="range-label" class="range" aria-live="polite"></div>
  </div>
</header>
<main id="main" aria-live="polite"></main>
<footer class="foot">
  <span id="status"></span>
  <a id="pdf-link" href="#" target="_blank" rel="noopener">Official district calendar (PDF)</a>
  <a id="repo-link" href="#" target="_blank" rel="noopener">Source on GitHub</a>
</footer>
<script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: styles.css**

```css
:root {
  --bg: #f6f7f9; --card: #fff; --ink: #1f2430; --muted: #6b7280; --line: #e5e7eb;
  --accent: #1d4ed8; --closed: #b91c1c; --early: #b45309; --delayed: #0e7490;
  --radius: 12px; color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #0f1218; --card: #171b24; --ink: #e6e8ee; --muted: #9aa3b2; --line: #2a3040; color-scheme: dark; }
}
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: var(--bg); color: var(--ink); padding: 0 16px calc(24px + env(safe-area-inset-bottom, 0px)); }
h1 { font-size: 1.35rem; margin: 0; }
.tagline { margin: 2px 0 0; color: var(--muted); font-size: .9rem; }
.top { padding-top: calc(16px + env(safe-area-inset-top, 0px)); display: grid; gap: 12px; max-width: 1200px; margin: 0 auto; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { --c: var(--accent); border: 2px solid var(--c); background: transparent; color: var(--c); border-radius: 999px; padding: 6px 12px; font: inherit; font-weight: 600; cursor: pointer; }
.chip[aria-pressed="true"] { background: var(--c); color: #fff; }
.chip small { font-weight: 400; opacity: .85; margin-left: 4px; }
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
.seg, .nav { display: inline-flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--card); }
.seg button, .nav button { border: 0; background: transparent; color: var(--ink); padding: 8px 14px; font: inherit; cursor: pointer; }
.seg button + button, .nav button + button { border-left: 1px solid var(--line); }
.seg button[aria-pressed="true"] { background: var(--accent); color: #fff; }
.nav button:hover, .seg button:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.range { font-weight: 600; }
main { max-width: 1200px; margin: 16px auto 0; }
.hint, .empty { color: var(--muted); text-align: center; padding: 32px 8px; }
.banner { display: grid; gap: 6px; margin-bottom: 12px; }
.banner-item { padding: 10px 14px; border-radius: var(--radius); font-weight: 600; color: #fff; background: var(--accent); }
.kind-closed { background: var(--closed); } .kind-early { background: var(--early); } .kind-delayed { background: var(--delayed); }
.cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.card { --c: var(--accent); background: var(--card); border: 1px solid var(--line); border-top: 4px solid var(--c); border-radius: var(--radius); padding: 12px 14px; }
.card h2 { margin: 0; font-size: 1rem; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.card h2 small { color: var(--muted); font-weight: 400; }
.day-badge { display: inline-block; margin: 8px 0 6px; padding: 6px 14px; border-radius: 10px; background: var(--c); color: #fff; font-size: 1.5rem; font-weight: 800; letter-spacing: .5px; }
.day-badge.none { background: transparent; color: var(--muted); border: 1px dashed var(--line); font-size: .95rem; font-weight: 500; }
.events { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.ev { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: baseline; }
.ev time { color: var(--muted); font-variant-numeric: tabular-nums; font-size: .9rem; white-space: nowrap; }
.ev .venue { color: var(--muted); font-size: .85rem; }
.ev.kind-closed, .ev.kind-early, .ev.kind-delayed { background: none; }
.ev.kind-closed .title { color: var(--closed); font-weight: 600; }
.ev.kind-early .title { color: var(--early); font-weight: 600; }
.ev.kind-delayed .title { color: var(--delayed); font-weight: 600; }
.district { margin-top: 12px; color: var(--muted); font-size: .9rem; }
.district ul { margin: 4px 0 0; padding-left: 18px; }
/* week */
.week { display: grid; gap: 10px; grid-template-columns: repeat(5, minmax(0, 1fr)); }
.col { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 10px; min-width: 0; }
.col.today { outline: 2px solid var(--accent); }
.col h3 { margin: 0 0 8px; font-size: .95rem; display: flex; justify-content: space-between; }
.col h3 .dow { color: var(--muted); font-weight: 500; }
.col .banner-item { padding: 6px 10px; font-size: .85rem; font-weight: 600; margin-bottom: 6px; }
.row { --c: var(--accent); border-left: 3px solid var(--c); padding: 4px 0 4px 8px; margin: 6px 0; min-width: 0; }
.row .who { display: flex; align-items: center; gap: 6px; font-size: .8rem; color: var(--muted); }
.row .who b { color: var(--c); }
.row .mini { display: inline-block; background: var(--c); color: #fff; border-radius: 6px; padding: 1px 7px; font-weight: 700; font-size: .85rem; }
.row .t { font-size: .9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row .t time { color: var(--muted); font-size: .8rem; margin-right: 4px; }
.foot { max-width: 1200px; margin: 24px auto 0; display: flex; flex-wrap: wrap; gap: 6px 16px; color: var(--muted); font-size: .85rem; }
.foot a { color: inherit; }
.retry { border: 1px solid var(--line); background: transparent; color: var(--ink); border-radius: 8px; padding: 4px 10px; font: inherit; cursor: pointer; }
@media (max-width: 899px) { .week { grid-template-columns: 1fr; } .col.past { opacity: .75; } }
```

- [ ] **Step 3: app.js — state, storage, chips, controls (renders a placeholder in main)**

```js
import { SCHOOLS, SELECTABLE_KEYS, API_BASE, PDF_URL, REPO_URL } from './schools.js';
import { parseHash, buildHash, formatDate, addDays, weekRange, mondayOf, isWeekend,
         normalize, sortEvents, buildEventsUrl, parseDate } from './lib.js';

const LS_SCHOOLS = 'frsdcal.schools';
const CACHE_PREFIX = 'frsdcal.cache.';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const BY_KEY = Object.fromEntries(SCHOOLS.map(s => [s.key, s]));
const DISTRICT = SCHOOLS.find(s => s.always);
const $ = id => document.getElementById(id);

const todayStr = () => formatDate(new Date());
const state = { schools: [], view: 'today', date: todayStr() };
let events = [];               // normalized events for the fetched window
let status = { fetchedAt: null, cached: false, failed: [], loading: false };
let loadSeq = 0;

// ---------- storage (every access guarded) ----------
const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  keys() { try { return Object.keys(localStorage); } catch { return []; } },
};

// ---------- state ----------
function setState(patch, { reload = true } = {}) {
  Object.assign(state, patch);
  store.set(LS_SCHOOLS, state.schools);
  const h = buildHash(state, todayStr());
  if (location.hash !== h) history.replaceState(null, '', h || location.pathname + location.search);
  renderControls();
  if (reload) load(); else render();
}

function readInitialState() {
  const fromHash = parseHash(location.hash, SELECTABLE_KEYS);
  const saved = store.get(LS_SCHOOLS);
  const schools = fromHash.schools.length ? fromHash.schools
    : Array.isArray(saved) ? saved.filter(k => SELECTABLE_KEYS.includes(k)) : [];
  return { schools, view: fromHash.view, date: fromHash.date || todayStr() };
}

// ---------- controls ----------
function renderChips() {
  $('chips').innerHTML = '';
  for (const s of SCHOOLS) {
    if (s.always) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.style.setProperty('--c', s.color);
    b.dataset.key = s.key;
    b.setAttribute('aria-pressed', String(state.schools.includes(s.key)));
    b.innerHTML = `${s.short}<small>${s.grades}</small>`;
    b.title = s.name;
    b.addEventListener('click', () => {
      const on = state.schools.includes(s.key);
      const next = on ? state.schools.filter(k => k !== s.key)
                      : SELECTABLE_KEYS.filter(k => k === s.key || state.schools.includes(k)); // keep table order
      setState({ schools: next });
    });
    $('chips').appendChild(b);
  }
}

function renderControls() {
  for (const b of $('chips').children) b.setAttribute('aria-pressed', String(state.schools.includes(b.dataset.key)));
  $('view-today').setAttribute('aria-pressed', String(state.view === 'today'));
  $('view-week').setAttribute('aria-pressed', String(state.view === 'week'));
  $('range-label').textContent = rangeLabel();
}

const fmtLong = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const fmtDow = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
function rangeLabel() {
  if (state.view === 'today') return fmtLong.format(parseDate(state.date));
  const w = weekRange(state.date);
  return `${fmtShort.format(parseDate(w.monday))} – ${fmtShort.format(parseDate(w.friday))}`;
}

function wireControls() {
  $('view-today').addEventListener('click', () => setState({ view: 'today' }));
  $('view-week').addEventListener('click', () => setState({ view: 'week' }));
  $('nav-today').addEventListener('click', () => setState({ date: todayStr() }));
  $('nav-prev').addEventListener('click', () => step(-1));
  $('nav-next').addEventListener('click', () => step(1));
  window.addEventListener('hashchange', () => { Object.assign(state, readInitialState()); renderControls(); load(); });
  $('pdf-link').href = PDF_URL; $('repo-link').href = REPO_URL;
}
function step(dir) {
  if (state.view === 'week') return setState({ date: addDays(weekRange(state.date).monday, 7 * dir) });
  let d = addDays(state.date, dir);
  while (isWeekend(d)) d = addDays(d, dir); // skip weekends in Today view
  setState({ date: d });
}

// ---------- data (Task 7) ----------
async function load() { render(); }

// ---------- render (Tasks 8–10) ----------
function render() {
  const main = $('main');
  if (!state.schools.length) { main.innerHTML = '<p class="hint">Pick your schools above to get started.</p>'; return; }
  main.innerHTML = '<p class="empty">Loading…</p>';
}

// ---------- boot ----------
Object.assign(state, readInitialState());
renderChips();
wireControls();
setState({}, { reload: true });
```

- [ ] **Step 4: Manual check.** `python3 -m http.server 8080` in the repo root, open `http://localhost:8080/`. Chips toggle, hash updates (`#s=ch,rfis`), reload keeps selection, Week toggle changes label, prev/next in Today skips weekends. Nothing else is expected to render yet.

- [ ] **Step 5: Commit** `feat(app): shell, styles, state and controls`

---

### Task 7: Fetch, pagination, cache

**Files:** Modify `app.js` (replace the `load` stub)

**Interfaces:**
- Produces: `fetchAllPages(school, start, end): Promise<rawEvent[]>`, `getSchoolWeek(school, monday): Promise<{ events, fromCache, failed }>`, `load(): Promise<void>` sets `events`, `status`, then calls `render()`.

- [ ] **Step 1: Implement**

```js
// ---------- data ----------
async function fetchAllPages(school, start, end) {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const res = await fetch(buildEventsUrl(API_BASE, school, start, end, page), { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    out.push(...(json.events || []));
    if (!json.meta?.links?.next) break;
  }
  return out;
}

function pruneCache() {
  const cutoff = Date.now() - CACHE_MAX_AGE_MS;
  for (const k of store.keys()) {
    if (!k.startsWith(CACHE_PREFIX)) continue;
    const v = store.get(k);
    if (!v || !v.fetchedAt || v.fetchedAt < cutoff) store.remove(k);
  }
}

async function getSchoolWeek(school, monday) {
  const key = `${CACHE_PREFIX}${school.key}.${monday}`;
  const cached = store.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return { events: cached.events, fromCache: false, failed: false, fetchedAt: cached.fetchedAt };
  try {
    const raw = await fetchAllPages(school, monday, addDays(monday, 6));
    const evs = raw.flatMap(r => normalize(r, school.key));
    const fetchedAt = Date.now();
    store.set(key, { fetchedAt, events: evs });
    return { events: evs, fromCache: false, failed: false, fetchedAt };
  } catch (err) {
    console.warn('fetch failed', school.key, err);
    if (cached) return { events: cached.events, fromCache: true, failed: false, fetchedAt: cached.fetchedAt };
    return { events: [], fromCache: false, failed: true, fetchedAt: null };
  }
}

function currentMonday() { return state.view === 'week' ? weekRange(state.date).monday : mondayOf(state.date); }

async function load() {
  const seq = ++loadSeq;
  if (!state.schools.length) { events = []; status = { ...status, loading: false }; render(); return; }
  status = { ...status, loading: true }; render();
  const monday = currentMonday();
  const wanted = [DISTRICT, ...state.schools.map(k => BY_KEY[k])];
  const results = await Promise.all(wanted.map(s => getSchoolWeek(s, monday)));
  if (seq !== loadSeq) return; // a newer load superseded this one
  events = results.flatMap(r => r.events);
  status = {
    loading: false,
    cached: results.some(r => r.fromCache),
    failed: wanted.filter((s, i) => results[i].failed).map(s => s.key),
    fetchedAt: Math.max(0, ...results.map(r => r.fetchedAt || 0)) || null,
  };
  render();
}
```
Also call `pruneCache();` once in the boot section before `setState`.

- [ ] **Step 2: Manual check.** Reload page with `#s=ch,rfis`; DevTools Network shows requests to `thrillshare-cmsv2.services.thrillshare.com`; Application → Local Storage shows `frsdcal.cache.ch.2026-09-14` with events; a second reload makes no network requests.
- [ ] **Step 3: Commit** `feat(app): fetch with pagination and localStorage cache`

---

### Task 8: Today view

**Files:** Modify `app.js` (`render`)

**Interfaces:**
- Produces: `renderToday(): string` HTML; helper `esc(s)`, `fmtTime('18:30') → '6:30 PM'`, `eventLi(ev)`.

- [ ] **Step 1: Implement**

```js
// ---------- render ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`;
}
function eventLi(ev, { showTime = true } = {}) {
  const time = ev.allDay || !showTime ? '' : `<time>${esc(fmtTime(ev.startTime))}${ev.endTime ? '–' + esc(fmtTime(ev.endTime)) : ''}</time>`;
  const venue = ev.venue ? `<div class="venue">${esc(ev.venue)}</div>` : '';
  return `<li class="ev kind-${ev.kind}">${time || '<span></span>'}<div><div class="title">${esc(ev.title)}</div>${venue}</div></li>`;
}
const onDate = (d, key) => events.filter(e => e.date === d && (key ? e.school === key : true)).sort(sortEvents);
const isAlert = e => e.kind !== 'event';

function bannerHtml(d) {
  const alerts = onDate(d, DISTRICT.key).filter(isAlert);
  return alerts.length ? `<section class="banner">${alerts.map(e => `<div class="banner-item kind-${e.kind}">${esc(e.title)}</div>`).join('')}</section>` : '';
}

function schoolCard(s, d) {
  const evs = onDate(d, s.key);
  const day = evs.find(e => e.dayLabel);
  const rest = evs.filter(e => e !== day);
  const badge = day ? `<div class="day-badge">${esc(day.dayLabel)}</div>` : `<div class="day-badge none">No rotation day</div>`;
  const list = rest.length ? `<ul class="events">${rest.map(e => eventLi(e)).join('')}</ul>`
    : `<p class="empty" style="padding:8px 0">Nothing else scheduled</p>`;
  const failed = status.failed.includes(s.key)
    ? `<p class="empty" style="padding:8px 0">Couldn't load. <button class="retry" data-retry>Retry</button></p>` : '';
  return `<article class="card" style="--c:${s.color}"><h2>${esc(s.name)} <small>${esc(s.grades)}</small></h2>${badge}${failed || list}</article>`;
}

function renderToday() {
  const d = state.date;
  const cards = state.schools.map(k => schoolCard(BY_KEY[k], d)).join('');
  const other = onDate(d, DISTRICT.key).filter(e => !isAlert(e));
  const district = other.length ? `<section class="district">District: <ul>${other.map(e => `<li>${e.allDay ? '' : esc(fmtTime(e.startTime)) + ' · '}${esc(e.title)}</li>`).join('')}</ul></section>` : '';
  const weekend = isWeekend(d) ? '<p class="hint">Weekend — no school.</p>' : '';
  return `${bannerHtml(d)}${weekend}<div class="cards">${cards}</div>${district}`;
}

function renderStatus() {
  const parts = [];
  if (status.loading) parts.push('Loading…');
  else if (status.fetchedAt) parts.push(`Updated ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(status.fetchedAt)}`);
  if (status.cached) parts.push('showing cached data');
  if (status.failed.length) parts.push(`couldn't load: ${status.failed.map(k => BY_KEY[k].short).join(', ')}`);
  $('status').textContent = parts.join(' · ');
}

function render() {
  const main = $('main');
  renderStatus();
  if (!state.schools.length) { main.innerHTML = '<p class="hint">Pick your schools above to get started.</p>'; return; }
  if (status.loading && !events.length) { main.innerHTML = '<p class="empty">Loading…</p>'; return; }
  main.innerHTML = state.view === 'today' ? renderToday() : renderWeek();
  main.querySelectorAll('[data-retry]').forEach(b => b.addEventListener('click', () => load()));
}
function renderWeek() { return '<p class="empty">Week view coming in Task 9</p>'; }
```

- [ ] **Step 2: Manual check.** With `#s=ch,rfis&d=2026-09-17`: CH card shows big "Day 4", RFIS shows "Day 4/B". With `d=2026-09-21`: red banner "FRSD-School Closed, Yom Kippur" and both cards show "No rotation day". With `d=2026-09-23`: District list shows Board of Education Meeting with a time.
- [ ] **Step 3: Commit** `feat(app): today view`

---

### Task 9: Week view

**Files:** Modify `app.js` (replace `renderWeek`)

- [ ] **Step 1: Implement**

```js
function renderWeek() {
  const w = weekRange(state.date), today = todayStr();
  const cols = w.days.map(d => {
    const dt = parseDate(d);
    const cls = ['col', d === today ? 'today' : '', d < today ? 'past' : ''].join(' ');
    const banners = onDate(d, DISTRICT.key).filter(isAlert)
      .map(e => `<div class="banner-item kind-${e.kind}">${esc(e.title)}</div>`).join('');
    const rows = state.schools.map(k => {
      const s = BY_KEY[k]; const evs = onDate(d, k);
      const day = evs.find(e => e.dayLabel); const rest = evs.filter(e => e !== day);
      const lines = rest.map(e => `<div class="t" title="${esc(e.title)}">${e.allDay ? '' : `<time>${esc(fmtTime(e.startTime))}</time>`}${esc(e.title)}</div>`).join('');
      return `<div class="row" style="--c:${s.color}"><div class="who"><b>${esc(s.short)}</b>${day ? `<span class="mini">${esc(day.dayLabel)}</span>` : ''}</div>${lines}</div>`;
    }).join('');
    const other = onDate(d, DISTRICT.key).filter(e => !isAlert(e))
      .map(e => `<div class="t district" title="${esc(e.title)}">${esc(e.title)}</div>`).join('');
    return `<section class="${cls}"><h3><span>${fmtShort.format(dt)}</span><span class="dow">${fmtDow.format(dt)}</span></h3>${banners}${rows}${other}</section>`;
  }).join('');
  return `<div class="week">${cols}</div>`;
}
```

- [ ] **Step 2: Manual check.** `#s=ch,rfis&v=week`: five columns Mon–Fri, today outlined, CH/RFIS rows show Day badges each day; next week (›) shows Yom Kippur banner on Monday 9/21 and no badges that day. Narrow the window below 900px: columns stack.
- [ ] **Step 3: Commit** `feat(app): week view`

---

### Task 10: README, repo link, GitHub Pages notes

**Files:** Create `README.md`; Modify `schools.js` (`REPO_URL`)

- [ ] **Step 1: README.md**

```markdown
# FRSD Family Calendar

One page that shows **today** or **this week** for any set of Flemington-Raritan
(FRSD, NJ) schools, side by side: each school's rotation day ("Day 4", "Day 4/B",
"A Day"), school events, and district-wide closures / early dismissals / delayed openings.

Live: https://<user>.github.io/frsd-calendar/

## Use it
1. Open the page and tap the schools your kids attend.
2. Toggle **Today** / **Week**. Use ‹ › to move.
3. Bookmark the URL. Your selection is in it, e.g. `#s=ch,rfis&v=week`, so you can
   share it with a co-parent or another family at the same schools.

Data is pulled live from the district's public website API (Apptegy/Thrillshare) and
cached in your browser for six hours. If the network is down you'll see the last copy
with a "showing cached data" note. The official PDF calendar is linked in the footer.

## Run locally
    python3 -m http.server 8080   # any static server works
    open http://localhost:8080/

## Test
    node --test test/     # Node 20+

## Adapt for another Apptegy district
Edit `schools.js`. For each school, open its Events page, view page source, and search
for `cms/events?section_ids=` — the number after `/o/` is `org`, the number after
`section_ids=` is `section`. Update `PDF_URL` and `REPO_URL`.

## Deploy on GitHub Pages
Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`. No build step.

Not affiliated with FRSD. Verify important dates against the official calendar.
```

- [ ] **Step 2:** Set `REPO_URL` in `schools.js` to the actual repo URL once known (placeholder `https://github.com/<user>/frsd-calendar` until then).
- [ ] **Step 3: Run** `node --test test/` → all pass. **Step 4: Commit** `docs: README and deploy notes`

---

## Self-review

- **Spec coverage:** data sources + rotation regex (T2), classification (T2), Today view incl. banner/cards/weekend (T8), Week view incl. weekend roll-forward and stacking (T3, T9, CSS T6), hash + localStorage + hint when empty (T5, T6), cache TTL/prune/fallback + retry + "cached" status (T7, T8), footer links (T6/T10), files list (all), tests via node --test (T1–T5), README (T10). Out-of-scope items not built.
- **Placeholders:** none; `REPO_URL` is a real config value to fill after the repo exists, called out in T10.
- **Type consistency:** `NormalizedEvent` fields (`date, school, dayLabel, kind, allDay, startTime, endTime, venue, title`) are used identically in T4, T8, T9. `weekRange().days/monday/friday` used in T6/T7/T9 match T3. `status.failed` is an array of keys in T7 and read as such in T8.
