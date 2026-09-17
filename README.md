# FRSD Family Calendar

One page that shows **today** or **this week** for any set of Flemington-Raritan
(FRSD, NJ) schools, side by side: each school's rotation day ("Day 4", "Day 4/B",
"A Day"), that school's events, and district-wide closures, early dismissals and
delayed openings.

Live: https://<user>.github.io/frsd-calendar/

## Use it

1. Open the page and tap the schools your kids attend.
2. Toggle **Today** / **Week**. Use ‹ › to move between days or weeks.
3. Bookmark the URL. Your selection is in it, for example `#s=ch,rfis&v=week`,
   so you can share it with a co-parent or another family at the same schools.

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
`/o/` is `org`; the number after `section_ids=` is `section`. Update `PDF_URL`
and `REPO_URL` too. Rotation-day detection lives in `lib.js` (`isRotationDay`).

## Deploy on GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
There is no build step; the repo root is the site.

Not affiliated with FRSD. Verify important dates against the official calendar.
