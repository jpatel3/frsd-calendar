import { SCHOOLS, SELECTABLE_KEYS, API_BASE, PDF_URL, REPO_URL } from './schools.js';
import { parseHash, buildHash, formatDate, addDays, weekRange, mondayOf, isWeekend,
         normalize, sortEvents, dedupe, buildEventsUrl, parseDate } from './lib.js';

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
const fmtClock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
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
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { events: cached.events, fromCache: false, failed: false, fetchedAt: cached.fetchedAt };
  }
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
  events = dedupe(results.flatMap(r => r.events));
  status = {
    loading: false,
    cached: results.some(r => r.fromCache),
    failed: wanted.filter((s, i) => results[i].failed).map(s => s.key),
    fetchedAt: Math.max(0, ...results.map(r => r.fetchedAt || 0)) || null,
  };
  render();
}

// ---------- render ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`;
}
function eventLi(ev) {
  const time = ev.allDay ? '<span></span>'
    : `<time>${esc(fmtTime(ev.startTime))}${ev.endTime ? '–' + esc(fmtTime(ev.endTime)) : ''}</time>`;
  const venue = ev.venue ? `<div class="venue">${esc(ev.venue)}</div>` : '';
  return `<li class="ev kind-${ev.kind}">${time}<div><div class="title">${esc(ev.title)}</div>${venue}</div></li>`;
}
const onDate = (d, key) => events.filter(e => e.date === d && (key ? e.school === key : true)).sort(sortEvents);
const isAlert = e => e.kind !== 'event';

function bannerHtml(d) {
  const alerts = onDate(d, DISTRICT.key).filter(isAlert);
  return alerts.length
    ? `<section class="banner">${alerts.map(e => `<div class="banner-item kind-${e.kind}">${esc(e.title)}</div>`).join('')}</section>` : '';
}

function schoolCard(s, d) {
  const evs = onDate(d, s.key);
  const day = evs.find(e => e.dayLabel);
  const rest = evs.filter(e => e !== day);
  const badge = day ? `<div class="day-badge">${esc(day.dayLabel)}</div>` : `<div class="day-badge none">No rotation day</div>`;
  const list = rest.length ? `<ul class="events">${rest.map(eventLi).join('')}</ul>` : `<p class="empty">Nothing else scheduled</p>`;
  const failed = status.failed.includes(s.key)
    ? `<p class="empty">Couldn't load. <button class="retry" type="button" data-retry>Retry</button></p>` : '';
  return `<article class="card" style="--c:${s.color}"><h2>${esc(s.name)} <small>${esc(s.grades)}</small></h2>${badge}${failed || list}</article>`;
}

function renderToday() {
  const d = state.date;
  const cards = state.schools.map(k => schoolCard(BY_KEY[k], d)).join('');
  const other = onDate(d, DISTRICT.key).filter(e => !isAlert(e));
  const district = other.length
    ? `<section class="district">District: <ul>${other.map(e => `<li>${e.allDay ? '' : esc(fmtTime(e.startTime)) + ' · '}${esc(e.title)}</li>`).join('')}</ul></section>` : '';
  const weekend = isWeekend(d) ? '<p class="hint">Weekend — no school.</p>' : '';
  return `${bannerHtml(d)}${weekend}<div class="cards">${cards}</div>${district}`;
}

function renderWeek() {
  const w = weekRange(state.date), today = todayStr();
  const cols = w.days.map(d => {
    const dt = parseDate(d);
    const cls = ['col', d === today && 'today', d < today && 'past'].filter(Boolean).join(' ');
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

function renderStatus() {
  const parts = [];
  if (status.loading) parts.push('Loading…');
  else if (status.fetchedAt) parts.push(`Updated ${fmtClock.format(status.fetchedAt)}`);
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

// ---------- boot ----------
pruneCache();
Object.assign(state, readInitialState());
renderChips();
wireControls();
setState({});
