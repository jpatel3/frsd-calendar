import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Minimal browser shims so data.js runs under Node.
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
  get length() { return mem.size; },
  key: i => [...mem.keys()][i],
};
Object.defineProperty(globalThis.localStorage, 'keys', { value: () => [...mem.keys()] });
// Object.keys(localStorage) is what data.js uses; make own-enumerable props mirror the map.
const realKeys = Object.keys;
Object.keys = o => (o === globalThis.localStorage ? [...mem.keys()] : realKeys(o));

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ch.json', import.meta.url)));
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; return { ok: true, json: async () => ({ events: fixture.events, meta: { links: {} } }) }; };

const { loadSchoolWeek } = await import('../data.js');
const { SCHOOLS } = await import('../schools.js');
const CH = SCHOOLS.find(s => s.key === 'ch');

beforeEach(() => { mem.clear(); fetchCalls = 0; });

test('a fresh v1-shaped cache entry ({fetchedAt, events}) is ignored, not returned as empty data', async () => {
  mem.set('frsdcal.cache.ch.2026-09-14', JSON.stringify({ fetchedAt: Date.now(), events: [{ title: 'old shape' }] }));
  const r = await loadSchoolWeek(CH, '2026-09-14');
  assert.equal(fetchCalls, 1, 'should refetch instead of trusting the malformed entry');
  assert.ok(Array.isArray(r.data) && r.data.length > 0, 'data must be the normalized events');
  assert.equal(r.failed, false);
});

test('a fresh v2-shaped cache entry is served without fetching', async () => {
  mem.set('frsdcal.cache.ch.2026-09-14', JSON.stringify({ fetchedAt: Date.now(), data: [{ title: 'cached' }] }));
  const r = await loadSchoolWeek(CH, '2026-09-14');
  assert.equal(fetchCalls, 0);
  assert.deepEqual(r.data, [{ title: 'cached' }]);
});

test('a stale v1-shaped entry is not used as the offline fallback either', async () => {
  mem.set('frsdcal.cache.ch.2026-09-14', JSON.stringify({ fetchedAt: 0, events: [{ title: 'old shape' }] }));
  globalThis.fetch = async () => { throw new Error('offline'); };
  const r = await loadSchoolWeek(CH, '2026-09-14');
  assert.equal(r.failed, true);
  assert.equal(r.data, null);
});
