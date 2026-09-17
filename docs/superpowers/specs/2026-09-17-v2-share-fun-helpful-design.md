# FRSD Family Calendar v2 — Share, Fun, Helpful

**Date:** 2026-09-17 · **Builds on:** `2026-09-17-frsd-calendar-design.md`
Twelve additions chosen by the user. Still no build step, no dependencies.

## New file layout
```
data.js      fetch + cache layer (events, district year, news, weather) — moved out of app.js
lib.js       + emojiFor, weatherEmoji, funLine, schoolYearRange, schoolDaysBetween,
               nextDayOff, nextBreak, shareUrl
app.js       UI only; imports data.js + lib.js
manifest.webmanifest, icons/{icon.svg,icon-192.png,icon-512.png,apple-touch-icon.png,og.png}
```
localStorage additions: `frsdcal.theme`, `frsdcal.names`, `frsdcal.year.{startYear}` (24 h),
`frsdcal.news.{key}` (30 min), `frsdcal.weather` (1 h).

## 1 Theme toggle
Header button cycles Auto → Light → Dark (icons ◐ ☀️ 🌙). Sets `data-theme` on `<html>`
(`light`/`dark`, removed for Auto). CSS: light tokens on `:root`; dark tokens under both
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and `:root[data-theme="dark"]`.
Applied before first paint by an inline script in `<head>` reading `frsdcal.theme`.

## 2 Share button
`navigator.share({ title, text, url })` when available, else clipboard copy + 2 s toast
"Link copied". URL = `shareUrl(origin+pathname, state)` = schools + view only, never the date.

## 3 Add to Home Screen
`manifest.webmanifest`: name "FRSD Family Calendar", short_name "FRSD Cal", `start_url: "./"`,
`display: standalone`, theme/background colors, icons 192 + 512 (`purpose: "any maskable"`).
`<link rel="manifest">`, `<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">`,
`<meta name="mobile-web-app-capable" content="yes">`. Saved schools come from localStorage so
the installed app opens on the parent's selection.

## 4 Link previews
`og:title`, `og:description`, `og:image` (absolute URL to `icons/og.png`, 1200×630), `og:url`,
`og:type=website`, `twitter:card=summary_large_image`. Static; scrapers cannot see the hash.

## 5 Subscribe links
`<details>` "Subscribe in your calendar app" in the footer area. For District + each selected
school: **iPhone/Apple** link `webcal://thrillshare-cmsv2.services.thrillshare.com/api/v4/o/{org}/cms/events/generate_ical?section_ids={section}`
and a **Copy URL** button (https version) for Google Calendar → "From URL".

## 6 Emoji auto-tags
`emojiFor(title, kind)` in lib: kind first (closed 🏠, early ⏰, delayed 🕘), then ordered
keyword table (picture 📸, book fair/library 📚, spirit/dress/pajama/neon/color/hat 🎉,
back to school night 🌙, field trip 🚌, conference 🗣️, pto 🤝, board of education 🏛️,
concert/band/chorus/music 🎵, first day 🎒, last day 🎓, ice cream/ice pop/social 🍦,
dine out/fundraiser 🍕, trimester/report card 📝, assessment/map growth/njsla ✏️,
halloween 🎃, valentine 💝, 100th day 💯, science 🔬, art 🎨, sports/game/meet/husky 🏅,
clothing drive/drive 📦). Returns '' if no match. Rotation-day badges get no emoji.
Rendered as a prefix on event titles in both views and in banners.

## 7 Countdown strip
Under the controls, two pills from the district year feed (`loadDistrictYear`, range
`schoolYearRange(today)` = Aug 1 → Jul 31, cached 24 h):
- `nextDayOff(events, today)` → first `closed` event on a weekday after today:
  "🏠 Next day off · Mon Oct 12 · Staff In-Service · in 9 school days"
- `nextBreak(events, today)` → first closed event whose title matches /recess|break/i after
  today, or the /last day of school/i event: "🎄 Winter Recess starts Thu Dec 24 · 62 school days"
`schoolDaysBetween(from, to, closedDates)` counts weekdays in (from, to) not in closedDates.
Hidden if the year feed fails.

## 8 No-school celebration
Today view: if the date is a weekend, or the district has a `closed` event that day, cards
are replaced by a big "No school today! 🎉" block with the reason(s) and `funLine(date)`
(deterministic pick from a list of ~10 lines, seeded by the date string). District banner
still shows.

## 9 Kid nicknames
Long-press (≥ 500 ms pointer hold) or double-click a chip → `prompt()` for a name; blank
clears. Stored in `frsdcal.names` as `{ key: name }`, never in the URL. Chip shows
"Maya · CH"; cards/rows show "Maya · Copper Hill School". Hint line under chips:
"Tip: long-press a chip to add your kid's name."

## 10 Announcements panel
`<details class="news">` "📣 Latest from your schools" below main. `loadNews(keys)` fetches
`live_feeds?section_ids={feedSection}&page_no=1` for District + selected schools (new
`feed` field in `schools.js`), cached 30 min. Merge, sort by `publishing_at` desc, show 8.
Each item: school short (colored), `time_ago`, text = `DOMParser` textContent of `status`
truncated to 220 chars with "more" toggle, plus any `http(s)` hrefs found in the HTML or in
`expanded_urls` rendered as "Link" anchors (`rel=noopener`, target blank). Never innerHTML the
raw status.

## 11 Print-friendly week
`@media print`: hide chips, controls, footer, news, countdown; force 5 columns; keep colors
(`print-color-adjust: exact`); page landscape hint via `@page { size: landscape }`.
🖨 button in the nav calls `window.print()`.

## 12 Weather
`WEATHER = { lat: 40.5123, lon: -74.8594, label: 'Flemington, NJ' }` in schools.js.
`loadWeather()` → Open-Meteo daily (weather_code, max, min, precipitation_probability_max, °F,
7 days, `timezone=America/New_York`), cached 1 h. `weatherEmoji(wmoCode)` in lib.
Today view: "☀️ 74° / 55° · 10% 🌧" after the date. Week view: emoji + high in each column
header. Hidden on failure.

## Error handling
Each new data source fails independently and silently hides its UI; events are unaffected.

## Testing
`node --test` for every new lib function with fixed dates. Headless-Chrome renders of the
local site for: theme attribute, celebration on 2026-09-21, countdown strip text, emoji
prefixes, weather present, news panel populated, print CSS present.
