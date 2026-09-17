import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHOOLS, SELECTABLE_KEYS } from '../schools.js';

test('schools config has exactly one always-on district entry', () => {
  assert.equal(SCHOOLS.filter(s => s.always).length, 1);
  assert.equal(SELECTABLE_KEYS.includes('frsd'), false);
  assert.equal(SELECTABLE_KEYS.length, 6);
});
