import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getCalendarDays,
  rescheduleIsoForDrop
} from '../client/js/components/calendar.js';

const apiSource = await readFile(new URL('../client/js/api/posts-api.js', import.meta.url), 'utf8');

test('posts API exposes lifecycle methods and encoded queue filters', () => {
  for (const name of ['listPosts', 'updatePost', 'cancelPost', 'duplicatePost', 'retryPublication', 'bulkCancelPosts', 'bulkReschedulePosts']) {
    assert.match(apiSource, new RegExp(`export function ${name}\\b`));
  }
  assert.match(apiSource, /URLSearchParams/);
  assert.match(apiSource, /encodeURIComponent/);
  assert.match(apiSource, /\/api\/posts\/bulk\/cancel/);
  assert.match(apiSource, /\/api\/posts\/bulk\/reschedule/);
});

test('month calendar returns complete week-aligned grid', () => {
  const days = getCalendarDays('month', new Date(2026, 8, 14));
  assert.equal(days.length % 7, 0);
  assert.ok(days.length >= 35);
  assert.equal(days[0].getDay(), 0);
  assert.equal(days.at(-1).getDay(), 6);
});

test('week and day calendar modes return seven and one local dates', () => {
  assert.equal(getCalendarDays('week', new Date(2026, 8, 14)).length, 7);
  assert.equal(getCalendarDays('day', new Date(2026, 8, 14)).length, 1);
});

test('drop-date reschedule preserves browser-local time-of-day while replacing the date', () => {
  const original = new Date(2026, 8, 14, 19, 25, 40, 123);
  const result = new Date(rescheduleIsoForDrop(original.toISOString(), '2026-09-20'));
  assert.equal(result.getFullYear(), 2026);
  assert.equal(result.getMonth(), 8);
  assert.equal(result.getDate(), 20);
  assert.equal(result.getHours(), 19);
  assert.equal(result.getMinutes(), 25);
  assert.equal(result.getSeconds(), 40);
  assert.equal(result.getMilliseconds(), 123);
});
