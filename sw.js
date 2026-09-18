// sw.js — an offline shell for the home-screen app. No build step, so nothing here
// is content-hashed: every same-origin file is network-first with a cache fallback.
// That way a deploy is always picked up whole (never new HTML against stale JS) and
// the cache only steps in when the network doesn't answer.
const VERSION = 'v1';
const CACHE = `frsdcal-${VERSION}`;
const NET_TIMEOUT = 3000;
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'lib.js', 'data.js', 'schools.js',
  'analytics.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // allSettled: one missing file must not leave the app with no offline shell at all.
    await Promise.allSettled(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' }))));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('frsdcal-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// The page asks for the new version only once the user taps Refresh.
self.addEventListener('message', e => { if (e.data === 'skip-waiting') self.skipWaiting(); });

// Same-origin GETs only. School feeds, weather and analytics go straight to the
// network untouched — data.js already caches those in localStorage with its own TTLs.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req), NET_TIMEOUT);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? await cache.match('index.html', { ignoreSearch: true }) : null);
    return hit || Response.error();
  }
}

// A dead-slow connection should fall back to the cache rather than hang on a spinner.
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, err => { clearTimeout(t); reject(err); });
  });
}
