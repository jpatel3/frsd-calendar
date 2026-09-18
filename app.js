import { SCHOOLS, SELECTABLE_KEYS, PDF_URL, REPO_URL, WEATHER, icalUrl } from './schools.js';
import { parseHash, buildHash, formatDate, addDays, weekRange, mondayOf, isWeekend, parseDate, sortEvents, dedupe,
         emojiFor, weatherEmoji, funLine, nextDayOff, nextBreak, cleanDistrictTitle, shareUrl } from './lib.js';
import { store, pruneCache, loadSchoolWeek, loadDistrictYear, loadNews, loadWeather } from './data.js';
import { initAnalytics, track } from './analytics.js';

const LS = { schools: 'frsdcal.schools', theme: 'frsdcal.theme', names: 'frsdcal.names' };
const BY_KEY = Object.fromEntries(SCHOOLS.map(s => [s.key, s]));
const DISTRICT = SCHOOLS.find(s => s.always);
const $ = id => document.getElementById(id);
const todayStr = () => formatDate(new Date());

const state = { schools: [], view: 'today', date: todayStr() };
let names = store.get(LS.names) || {};
let events = [];       // normalized events for the fetched week
let year = null;       // district events for the school year (countdown)
let weather = null;    // { date: { code, hi, lo, rain } }
let news = null;       // merged live-feed posts, or null until loaded
let status = { fetchedAt: null, cached: false, failed: [], loading: false };
let loadSeq = 0;

// ---------- formatting ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtLong = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const fmtMed = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const fmtDow = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const fmtClock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`;
}
const label = ev => { const e = emojiFor(ev.title, ev.kind); return (e ? e + ' ' : '') + ev.title; };
const displayName = s => (names[s.key] ? `${names[s.key]} · ${s.name}` : s.name);
const chipLabel = s => (names[s.key] ? `${esc(names[s.key])} · ${s.short}` : s.short);
const wx = d => {
  const w = weather && weather[d];
  return w ? `${weatherEmoji(w.code)} ${w.hi}° / ${w.lo}°${w.rain >= 30 ? ` · ${w.rain}% 🌧` : ''}` : '';
};

// ---------- theme ----------
const THEMES = ['auto', 'light', 'dark'];
const THEME_ICON = { auto: '◐', light: '☀️', dark: '🌙' };
function applyTheme(t) {
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  $('theme-btn').textContent = THEME_ICON[t];
  $('theme-btn').setAttribute('aria-label', `Theme: ${t}`);
}
function currentTheme() { const t = store.get(LS.theme); return THEMES.includes(t) ? t : 'auto'; }

// ---------- toast ----------
let toastTimer;
function toast(msg, action) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  el.classList.toggle('sticky', !!action);           // sticky toasts wait for a tap
  if (!action) { toastTimer = setTimeout(() => el.classList.remove('show'), 2200); return; }
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'toast-btn'; b.textContent = action.label;
  b.addEventListener('click', () => { el.classList.remove('show'); action.run(); });
  el.appendChild(b);
}

// ---------- state ----------
function setState(patch, { reload = true } = {}) {
  Object.assign(state, patch);
  store.set(LS.schools, state.schools);
  const h = buildHash(state, todayStr());
  if (location.hash !== h) history.replaceState(null, '', h || location.pathname + location.search);
  renderControls();
  if (reload) load(); else render();
}

function readInitialState() {
  const fromHash = parseHash(location.hash, SELECTABLE_KEYS);
  const saved = store.get(LS.schools);
  const schools = fromHash.schools.length ? fromHash.schools
    : Array.isArray(saved) ? saved.filter(k => SELECTABLE_KEYS.includes(k)) : [];
  return { schools, view: fromHash.view, date: fromHash.date || todayStr() };
}

// ---------- chips (toggle on tap, nickname on long-press / double-click) ----------
function editName(s) {
  const cur = names[s.key] || '';
  const v = prompt(`Your kid's name for ${s.name} (leave blank to clear):`, cur);
  if (v === null) return;
  const name = v.trim().slice(0, 24);
  if (name) names[s.key] = name; else delete names[s.key];
  store.set(LS.names, names);
  renderChips(); render();
}

function renderChips() {
  const box = $('chips'); box.innerHTML = '';
  for (const s of SCHOOLS) {
    if (s.always) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.style.setProperty('--c', s.color);
    b.dataset.key = s.key; b.title = `${s.name} (${s.grades})`;
    b.setAttribute('aria-pressed', String(state.schools.includes(s.key)));
    b.innerHTML = `${chipLabel(s)}<small>${s.grades}</small>`;
    let timer = null, longPressed = false;
    const start = () => { longPressed = false; timer = setTimeout(() => { longPressed = true; editName(s); }, 500); };
    const cancel = () => { clearTimeout(timer); timer = null; };
    b.addEventListener('pointerdown', start);
    b.addEventListener('pointerup', cancel); b.addEventListener('pointerleave', cancel); b.addEventListener('pointercancel', cancel);
    b.addEventListener('contextmenu', e => e.preventDefault());
    b.addEventListener('dblclick', () => editName(s));
    b.addEventListener('click', () => {
      if (longPressed) { longPressed = false; return; }
      const on = state.schools.includes(s.key);
      const next = on ? state.schools.filter(k => k !== s.key)
                      : SELECTABLE_KEYS.filter(k => k === s.key || state.schools.includes(k)); // keep table order
      news = null;
      track('select_schools', { schools: next.join(',') || 'none', count: next.length });
      setState({ schools: next });
    });
    box.appendChild(b);
  }
}

// A short "where am I" tag beside the date, so the day never reads as just another line of text.
function relativeTag() {
  const today = todayStr();
  if (state.view === 'week') {
    const diff = Math.round((parseDate(mondayOf(state.date)) - parseDate(mondayOf(today))) / 864e5 / 7);
    return diff === 0 ? 'This week' : diff === 1 ? 'Next week' : diff === -1 ? 'Last week' : '';
  }
  if (state.date === today) return 'Today';
  if (state.date === addDays(today, 1)) return 'Tomorrow';
  if (state.date === addDays(today, -1)) return 'Yesterday';
  return '';
}

function renderControls() {
  for (const b of $('chips').children) b.setAttribute('aria-pressed', String(state.schools.includes(b.dataset.key)));
  $('view-today').setAttribute('aria-pressed', String(state.view === 'today'));
  $('view-week').setAttribute('aria-pressed', String(state.view === 'week'));
  $('range-label').textContent = state.view === 'today' ? fmtLong.format(parseDate(state.date))
    : (w => `${fmtShort.format(parseDate(w.monday))} – ${fmtShort.format(parseDate(w.friday))}`)(weekRange(state.date));
  const tag = $('range-tag'), rel = relativeTag();
  tag.textContent = rel; tag.hidden = !rel;
  $('weather').textContent = state.view === 'today' ? wx(state.date) : '';
  $('weather').title = WEATHER.label;
}

function step(dir) {
  if (state.view === 'week') return setState({ date: addDays(weekRange(state.date).monday, 7 * dir) });
  let d = addDays(state.date, dir);
  while (isWeekend(d)) d = addDays(d, dir);
  setState({ date: d });
}

async function share() {
  const url = shareUrl(location.origin + location.pathname, state);
  const data = { title: 'FRSD Family Calendar', text: "Our kids' school days, all in one place", url };
  if (navigator.share) { track('share', { method: 'native' }); try { await navigator.share(data); } catch { /* user cancelled */ } return; }
  track('share', { method: 'copy' });
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { prompt('Copy this link:', url); }
}

function wireControls() {
  $('view-today').addEventListener('click', () => { track('view_change', { view: 'today' }); setState({ view: 'today' }); });
  $('view-week').addEventListener('click', () => { track('view_change', { view: 'week' }); setState({ view: 'week' }); });
  $('nav-today').addEventListener('click', () => setState({ date: todayStr() }));
  $('nav-prev').addEventListener('click', () => step(-1));
  $('nav-next').addEventListener('click', () => step(1));
  $('print-btn').addEventListener('click', () => { track('print', { view: state.view }); window.print(); });
  $('share-btn').addEventListener('click', share);
  $('theme-btn').addEventListener('click', () => {
    const t = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
    store.set(LS.theme, t); applyTheme(t);
  });
  $('news').addEventListener('toggle', () => { if ($('news').open) { track('open_panel', { panel: 'news' }); if (!news) loadNewsPanel(); } });
  $('subscribe').addEventListener('toggle', () => { if ($('subscribe').open) track('open_panel', { panel: 'subscribe' }); });
  document.addEventListener('click', async e => {
    const c = e.target.closest('[data-copy]');
    if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); toast('Calendar URL copied'); } catch { prompt('Copy this URL:', c.dataset.copy); } }
    const m = e.target.closest('.news-item .more');
    if (m) m.closest('.news-item').classList.add('open');
    if (e.target.closest('[data-retry]')) load();
  });
  window.addEventListener('hashchange', () => { Object.assign(state, readInitialState()); news = null; renderControls(); load(); });
  $('pdf-link').href = PDF_URL; $('repo-link').href = REPO_URL;
}

// ---------- data ----------
function currentMonday() { return state.view === 'week' ? weekRange(state.date).monday : mondayOf(state.date); }

async function load() {
  const seq = ++loadSeq;
  if (!state.schools.length) { events = []; status = { ...status, loading: false }; render(); return; }
  status = { ...status, loading: true }; render();
  const monday = currentMonday();
  const wanted = [DISTRICT, ...state.schools.map(k => BY_KEY[k])];
  const [weeks, yr, wxr] = await Promise.all([
    Promise.all(wanted.map(s => loadSchoolWeek(s, monday))),
    loadDistrictYear(DISTRICT, todayStr()),
    loadWeather(),
  ]);
  if (seq !== loadSeq) return;
  events = dedupe(weeks.flatMap(r => r.data || []));
  year = yr.data; weather = wxr.data;
  status = {
    loading: false,
    cached: weeks.some(r => r.fromCache),
    failed: wanted.filter((s, i) => weeks[i].failed).map(s => s.key),
    fetchedAt: Math.max(0, ...weeks.map(r => r.fetchedAt || 0)) || null,
  };
  renderControls(); render();
}

async function loadNewsPanel() {
  $('news-body').innerHTML = '<p class="empty">Loading…</p>';
  const wanted = [DISTRICT, ...state.schools.map(k => BY_KEY[k])];
  const res = await Promise.all(wanted.map(loadNews));
  news = res.flatMap(r => r.data || []).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8);
  renderNews();
}

// ---------- render ----------
const onDate = (d, key) => events.filter(e => e.date === d && (key ? e.school === key : true)).sort(sortEvents);
const isAlert = e => e.kind !== 'event';
const FLAG_TEXT = { closed: '🏠 Closed', early: '⏰ Early dismissal', delayed: '🕘 Delayed opening' };
// A school's own closed/early/delayed event for the day, shown as a chip beside its Day badge.
function flagHtml(evs) {
  const f = evs.find(isAlert);
  return f ? `<span class="flag kind-${f.kind}" title="${esc(f.title)}">${FLAG_TEXT[f.kind]}</span>` : '';
}

function eventLi(ev) {
  const time = ev.allDay ? '<span></span>'
    : `<time>${esc(fmtTime(ev.startTime))}${ev.endTime ? '–' + esc(fmtTime(ev.endTime)) : ''}</time>`;
  const venue = ev.venue ? `<div class="venue">${esc(ev.venue)}</div>` : '';
  return `<li class="ev kind-${ev.kind}">${time}<div><div class="title">${esc(label(ev))}</div>${venue}</div></li>`;
}

function bannerHtml(d, { skipClosed = false } = {}) {
  const alerts = onDate(d, DISTRICT.key).filter(isAlert).filter(e => !(skipClosed && e.kind === 'closed'));
  return alerts.length
    ? `<section class="banner">${alerts.map(e => `<div class="banner-item kind-${e.kind}">${esc(label(e))}</div>`).join('')}</section>` : '';
}

function schoolCard(s, d) {
  const evs = onDate(d, s.key);
  const day = evs.find(e => e.dayLabel);
  const rest = evs.filter(e => e !== day);
  const badge = (day ? `<div class="day-badge">${esc(day.dayLabel)}</div>` : `<div class="day-badge none">No rotation day</div>`) + flagHtml(rest);
  const list = rest.length ? `<ul class="events">${rest.map(eventLi).join('')}</ul>` : `<p class="empty">Nothing else scheduled</p>`;
  const failed = status.failed.includes(s.key)
    ? `<p class="empty">Couldn't load. <button class="retry" type="button" data-retry>Retry</button></p>` : '';
  return `<article class="card" style="--c:${s.color}"><h2>${esc(displayName(s))} <small>${esc(s.grades)}</small></h2>${badge}${failed || list}</article>`;
}

function renderToday() {
  const d = state.date;
  const closed = onDate(d, DISTRICT.key).filter(e => e.kind === 'closed');
  const weekend = isWeekend(d);
  const other = onDate(d, DISTRICT.key).filter(e => !isAlert(e));
  const district = other.length
    ? `<section class="district">District: <ul>${other.map(e => `<li>${e.allDay ? '' : esc(fmtTime(e.startTime)) + ' · '}${esc(label(e))}</li>`).join('')}</ul></section>` : '';
  if (weekend || closed.length) {
    const why = weekend ? "It's the weekend." : closed.map(e => cleanDistrictTitle(e.title)).join(' · ');
    return `${bannerHtml(d, { skipClosed: true })}<section class="party"><div class="party-title">No school today! 🎉</div><div class="party-why">${esc(why)}</div><div class="party-line">${esc(funLine(d))}</div></section>${district}`;
  }
  const cards = state.schools.map(k => schoolCard(BY_KEY[k], d)).join('');
  return `${bannerHtml(d)}<div class="cards">${cards}</div>${district}`;
}

function renderWeek() {
  const w = weekRange(state.date), today = todayStr();
  const cols = w.days.map(d => {
    const dt = parseDate(d);
    const cls = ['col', d === today && 'today', d < today && 'past'].filter(Boolean).join(' ');
    const banners = onDate(d, DISTRICT.key).filter(isAlert)
      .map(e => `<div class="banner-item kind-${e.kind}">${esc(label(e))}</div>`).join('');
    const rows = state.schools.map(k => {
      const s = BY_KEY[k]; const evs = onDate(d, k);
      const day = evs.find(e => e.dayLabel); const rest = evs.filter(e => e !== day);
      const lines = rest.map(e => `<div class="t" title="${esc(e.title)}">${e.allDay ? '' : `<time>${esc(fmtTime(e.startTime))}</time>`}${esc(label(e))}</div>`).join('');
      const who = names[k] ? `${esc(names[k])} · ${esc(s.short)}` : esc(s.short);
      return `<div class="row" style="--c:${s.color}"><div class="who"><b>${who}</b>${day ? `<span class="mini">${esc(day.dayLabel)}</span>` : ''}${flagHtml(rest)}</div>${lines}</div>`;
    }).join('');
    const other = onDate(d, DISTRICT.key).filter(e => !isAlert(e))
      .map(e => `<div class="t district" title="${esc(e.title)}">${esc(label(e))}</div>`).join('');
    const w2 = wx(d);
    return `<section class="${cls}"><h3><span>${fmtShort.format(dt)}</span><span class="dow">${fmtDow.format(dt)}</span>${w2 ? `<span class="wx">${w2}</span>` : ''}</h3>${banners}${rows}${other}</section>`;
  }).join('');
  return `<div class="week">${cols}</div>`;
}

function renderCountdown() {
  const box = $('countdown');
  if (!year || !state.schools.length) { box.hidden = true; return; }
  const today = todayStr();
  const off = nextDayOff(year, today), brk = nextBreak(year, today);
  const when = n => (n === 0 ? 'next school day' : n === 1 ? 'in 1 school day' : `in <span class="n">${n}</span> school days`);
  const pills = [];
  if (off) pills.push(`<span class="pill">🏠 <b>Next day off</b> · ${fmtMed.format(parseDate(off.date))} · ${esc(off.title)} · ${when(off.schoolDays)}</span>`);
  if (brk && (!off || brk.date !== off.date)) pills.push(`<span class="pill">${brk.emoji} <b>${esc(brk.title)}</b> · ${fmtMed.format(parseDate(brk.date))} · <span class="n">${brk.schoolDays}</span> school days to go</span>`);
  box.innerHTML = pills.join(''); box.hidden = !pills.length;
}

function renderSubscribe() {
  const list = [DISTRICT, ...state.schools.map(k => BY_KEY[k])].map(s =>
    `<li style="--c:${s.color}"><b>${esc(s.name)}</b> <a href="${icalUrl(s, 'webcal')}">Apple / iPhone</a> <button type="button" class="linky" data-copy="${icalUrl(s)}">Copy URL for Google</button></li>`).join('');
  $('subscribe-body').innerHTML = `<p class="sub-note">Official feeds from the school website. Apple: tap the link and choose Subscribe. Google Calendar: Other calendars → From URL → paste.</p><ul class="sub-list">${list}</ul>`;
}

function renderNews() {
  const body = $('news-body');
  if (!news) { body.innerHTML = ''; return; }
  if (!news.length) { body.innerHTML = '<p class="empty">No recent posts.</p>'; return; }
  const parser = new DOMParser();
  body.innerHTML = `<ul class="news-list">${news.map(p => {
    const doc = parser.parseFromString(p.html, 'text/html');
    const text = (doc.body.textContent || '').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
    const links = [...new Set([...doc.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).concat(p.urls))]
      .filter(u => /^https?:\/\//.test(u)).slice(0, 3);
    const s = BY_KEY[p.school];
    const short = text.length > 220 ? text.slice(0, 220).trimEnd() + '…' : text;
    const textHtml = text.length > 220
      ? `<span class="short">${esc(short)}</span><span class="full">${esc(text)}</span> <button type="button" class="linky more">more</button>` : esc(text);
    const linkHtml = links.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(new URL(u).hostname.replace(/^www\./, ''))} ↗</a>`).join('');
    return `<li class="news-item" style="--c:${s.color}"><div class="who"><b>${esc(s.short)}</b> · ${esc(p.ago)}</div><p>${textHtml}</p>${linkHtml}</li>`;
  }).join('')}</ul>`;
}

function renderStatus() {
  const parts = [];
  if (status.loading) parts.push('Loading…');
  else if (status.fetchedAt) parts.push(`Updated ${fmtClock.format(status.fetchedAt)}`);
  if (!navigator.onLine) parts.push('offline — showing saved data');
  else if (status.cached) parts.push('showing cached data');
  if (navigator.onLine && status.failed.length) parts.push(`couldn't load: ${status.failed.map(k => BY_KEY[k].short).join(', ')}`);
  $('status').textContent = parts.join(' · ');
}

function render() {
  const main = $('main');
  renderStatus(); renderCountdown(); renderSubscribe();
  if (!state.schools.length) { main.innerHTML = '<p class="hint">Pick your schools above to get started.</p>'; $('news-body').innerHTML = ''; return; }
  if (status.loading && !events.length) { main.innerHTML = '<p class="empty">Loading…</p>'; return; }
  main.innerHTML = state.view === 'today' ? renderToday() : renderWeek();
  if ($('news').open && !news) loadNewsPanel();
}

// ---------- offline shell ----------
let reloadOnControllerChange = false;

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadOnControllerChange) location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        // No controller yet means this is the first install — nothing to announce.
        if (!sw || !navigator.serviceWorker.controller) return;
        sw.addEventListener('statechange', () => {
          if (sw.state !== 'installed') return;
          toast('New version ready', { label: 'Refresh', run: () => { reloadOnControllerChange = true; sw.postMessage('skip-waiting'); } });
        });
      });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    } catch { /* the offline shell is a bonus; never let it break the page */ }
  });
}

// Coming back from a dead zone should heal by itself, not need a pull-to-refresh.
window.addEventListener('online', () => { renderStatus(); load(); });
window.addEventListener('offline', renderStatus);

// ---------- boot ----------
registerSW();
initAnalytics();
pruneCache();
applyTheme(currentTheme());
Object.assign(state, readInitialState());
renderChips();
wireControls();
setState({});
