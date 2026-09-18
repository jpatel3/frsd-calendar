# FRSD Family Calendar

One page that shows **today** or **this week** for any set of Flemington-Raritan
(FRSD, NJ) schools, side by side: each school's rotation day ("Day 4", "Day 4/B",
"A Day"), that school's events, and district-wide closures, early dismissals and
delayed openings.

Live: https://jpatel3.github.io/frsd-calendar/

## Use it

1. Open the page and tap the schools your kids attend.
2. Toggle **Today** / **Week**. Use ‹ › to move between days or weeks.
3. Tap **Share** to send the link (your school selection is in it, for example
   `#s=ch,rfis&v=week`) to a co-parent or another family at the same schools.
4. On your phone, use **Add to Home Screen** so it opens like an app.

Also on the page:

- **Day / night**: the ◐ button cycles Auto → Light → Dark.
- **Kid names**: long-press (or double-click) a school chip to label it, e.g. "Maya · CH".
  Names stay on your device and are not part of the shared link.
- **Countdown**: next day off and next break, counted in school days.
- **Weather** for Flemington next to the date (Open-Meteo, no account needed).
- **No school?** Weekends and closure days get a celebration instead of empty cards.
- **📣 Latest from your schools**: recent announcements from each school's live feed.
- **📆 Subscribe**: official iCal feeds per school for Apple or Google Calendar.
- **🖨 Print**: Week view prints on one landscape page for the fridge.

Data is pulled live from the district's public website API (Apptegy/Thrillshare)
and cached in your browser for six hours. If the network is down you'll see the
last copy with a "showing cached data" note. The official PDF calendar is linked
in the footer.

## Run locally

    python3 -m http.server 8080   # any static file server works
    open http://localhost:8080/

## Test

    node --test        # Node 20+, no dependencies

## Adapt for another Apptegy district

Edit `schools.js`. For each school, open its Events page on the district site,
view the page source, and search for `cms/events?section_ids=`. The number after
`/o/` is `org`; the number after `section_ids=` is `section`. Search the same
source for `live_feeds?section_ids=` to get `feed` (announcements). Update
`PDF_URL`, `REPO_URL`, `SITE_URL` and `WEATHER` (your town's coordinates) too.
Rotation-day detection and emoji keywords live in `lib.js`.

Files: `index.html` (shell), `styles.css`, `schools.js` (config), `lib.js` (pure
functions, tested), `data.js` (fetch + cache), `app.js` (UI), `manifest.webmanifest`
and `icons/` (home-screen icon and link preview image).

## Usage tracking

`GA_ID` in `schools.js` holds the Google Analytics 4 measurement ID. Leave it
empty and nothing is loaded and no request is made; set it and `analytics.js`
injects gtag.js — but only on `*.github.io`, so local tinkering never lands in
the numbers. Beyond pageviews it sends `select_schools`, `view_change`, `share`,
`print` and `open_panel` events.

For Google Search Console, add a URL-prefix property for the site, verify with
the *HTML tag* method and paste the token into the commented-out
`google-site-verification` meta in `index.html`, then submit `sitemap.xml`.
A `robots.txt` here would do nothing — crawlers only read it at the domain
root, which a project Pages site doesn't own.

## Deploy on GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
There is no build step; the repo root is the site.

Not affiliated with FRSD. Verify important dates against the official calendar.
