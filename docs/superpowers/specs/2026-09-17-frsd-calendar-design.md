# FRSD Family Calendar — Design

**Date:** 2026-09-17
**Status:** Approved in brainstorming, awaiting spec review

## Purpose

A one-page static web app that shows a combined Today or Week view of
school events for any set of Flemington-Raritan Regional School District
(FRSD) schools, including each school's rotation day ("Day 4", "Day 4/B",
"A Day"). Built for parents with kids at more than one FRSD school.
Generic: any FRSD parent can pick their schools and bookmark the link.

Hosted on GitHub Pages from a public repo. No build step, no server, no
API key.

## Data sources

All data comes live from the district's Apptegy/Thrillshare CMS, which
exposes a public, CORS-enabled JSON API:

```
https://thrillshare-cmsv2.services.thrillshare.com/api/v4/o/{org}/cms/events
  ?section_ids={section}&locale=en&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&page_no=N
```

- Returns `{ events: [...], meta: { links: { next, total_entries }, ... } }`.
- 20 events per page; follow `meta.links.next` until null.
- `start_date` / `end_date` filter inclusive by event start date.
- Event fields used: `id`, `title`, `start_at`, `end_at`, `all_day`,
  `venue`, `description`. Times are ISO with `-04:00`/`-05:00` offset.

Schools (static config in `schools.js`):

| key  | name                                        | grades | org   | section |
|------|---------------------------------------------|--------|-------|---------|
| frsd | District                                    | —      | 27053 | 457011  |
| bs   | Barley Sheaf School                         | PreK-4 | 27224 | 460560  |
| ch   | Copper Hill School                          | PreK-4 | 27225 | 460569  |
| fad  | Francis A. Desmares School                  | PreK-4 | 27226 | 460578  |
| rh   | Robert Hunter School                        | PreK-4 | 27229 | 460606  |
| rfis | Reading-Fleming Intermediate School         | 5-6    | 27228 | 460597  |
| jpc  | J.P. Case Middle School                     | 7-8    | 27227 | 460587  |

The district feed (`frsd`) mirrors the official PDF calendar (closures,
early dismissals, delayed openings, contingency days, BOE meetings). It is
always included; the PDF is linked in the footer as the authoritative
source, not parsed.

### Rotation-day detection

An event is a rotation day if its trimmed title matches either:

- `/^(?:[A-Z]{2,4}\s*-?\s*)?Day\s*(\d)(?:\s*\/\s*([AB]))?$/i`
  → label `Day N` or `Day N/X`  (BS, CH, FAD, RH, RFIS)
- `/^([AB])\s+Day$/i` → label `A Day` / `B Day`  (JPC)

Everything else is a regular event. "Spirit Day", "Labor Day - School
Closed", "First Day of School" do not match because the patterns require
the exact structure.

### Event classification (for styling only)

- `closed`: title matches `/school closed|no school/i`
- `early`: title matches `/early dismissal/i`
- `delayed`: title matches `/delayed opening/i`
- otherwise `event`

## UI

Single page, mobile-first (works at ~400px), also fine on a laptop.

**Header**
- App title, then a row of school toggle chips (one per school, district
  always on and not toggleable). Each school has a fixed color.
- View toggle: **Today** | **Week**.
- Navigation: ‹ prev · **Today** · next ›, plus the current date or
  week range label.

**Today view**
- District banner at top if any district item falls on this date
  (closed / early dismissal / delayed opening), styled by class.
- One card per selected school, in the order of the school table. Card
  shows: school name, rotation day as a large badge (or "—" if none), then
  a list of that school's other events for the day with time (if not
  all-day) and venue.
- Weekend or no-school day with nothing scheduled shows a quiet
  "Nothing scheduled" line inside each card.

**Week view**
- Mon–Fri columns (Sat/Sun omitted; if the selected date is a weekend, the
  week shown is the one containing that weekend's Monday, i.e. the
  upcoming week).
- Each column: date header (today highlighted), district banner items,
  then one row per selected school with the school color, rotation badge,
  and event titles truncated to one line each.
- On narrow screens columns stack vertically as day sections.

**Footer**
- "Updated HH:MM" from the fetch, "Showing cached data" if offline
  fallback was used, link to the official district PDF calendar, link to
  the GitHub repo.

## State and persistence

- Selected school keys live in the URL hash: `#s=ch,rfis&v=week&d=2026-09-21`.
  `v` and `d` are optional; `d` defaults to today, `v` to `today`.
- On load: read hash; if no `s`, fall back to `localStorage.frsdcal.schools`;
  if still empty, show the chips with none selected and a hint
  "Pick your schools above".
- Every change to selection/view/date rewrites the hash (`history.replaceState`)
  and saves schools to localStorage. The hash is the shareable link.

## Data flow

1. Compute the visible range: one day (Today) or Mon–Fri (Week). Always
   fetch a window of the full Mon–Sun week containing the visible range so
   toggling Today/Week does not refetch.
2. For `frsd` plus each selected school, fetch all pages for that range in
   parallel (`Promise.all`). Cache key per school+week:
   `frsdcal.cache.{key}.{monday-iso}` → `{ fetchedAt, events }` in
   localStorage. Serve from cache if younger than 6 hours; otherwise fetch
   and overwrite. Cache entries older than 30 days are pruned on load.
3. Normalize each event to
   `{ id, school, title, date (YYYY-MM-DD, local), allDay, startTime, endTime, venue, kind, dayLabel }`.
   Multi-day events (end date > start date) are expanded to one entry per
   day in range.
4. Render.

## Error handling

- A school fetch that fails (network, non-200, CORS) falls back to its
  cached entry regardless of age and marks the footer "Showing cached
  data". If there is no cache either, that school's card shows
  "Couldn't load — tap to retry".
- Malformed event (no `start_at`) is skipped.
- No selected schools is not an error; see State.

## Files

```
index.html      shell, header, containers, footer
styles.css      layout, school colors, kind styles, responsive rules
schools.js      the school table (only file a fork needs to edit)
app.js          state, hash/localStorage, fetch+cache, normalize, render
README.md       what it is, how to use the link, how to fork for another
                Apptegy district, how to enable Pages
```

No dependencies, no framework, no build. ES modules via
`<script type="module">`.

## Testing

- `test/normalize.test.html`: a page that loads `app.js` pure functions
  (`isRotationDay`, `classify`, `normalize`, `weekRange`) and asserts
  against fixture JSON captured from the live API (one page each from
  ch, rfis, jpc, frsd). Runs in the browser and in Node via
  `node --test test/*.test.mjs` for the same functions.
- Manual: open `index.html` via a local static server, pick ch+rfis,
  verify Sep 17 2026 shows "Day 4" for CH and "Day 4/B" for RFIS and the
  Sep 21 week shows the Yom Kippur closure banner.

## Out of scope (v1)

Month view, named kids/grades, push notifications, calendar export, any
data other than the FRSD Thrillshare feeds.
