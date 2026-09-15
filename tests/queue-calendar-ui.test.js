import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('../client/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../client/js/app.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../client/js/pages/queue-calendar.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../client/css/pages/queue-calendar.css', import.meta.url), 'utf8');

test('dashboard exposes calendar and queue lifecycle controls', () => {
  assert.match(index, /\/css\/pages\/queue-calendar\.css/);
  for (const id of [
    'calendar', 'calendar-mode', 'calendar-prev', 'calendar-today', 'calendar-next', 'calendar-title', 'calendar-grid',
    'queue-filter-form', 'queue-platform-filter', 'queue-account-filter', 'queue-state-filter', 'refresh-queue',
    'queue-bulk-time', 'queue-bulk-reschedule', 'queue-bulk-cancel', 'queue-feedback', 'scheduled-post-list'
  ]) assert.match(index, new RegExp(`id="${id}"`));
});

test('app bootstraps the dedicated queue/calendar page and refreshes it after scheduling', () => {
  assert.match(app, /initializeQueueCalendar/);
  assert.match(app, /queueCalendar\.refresh/);
});

test('queue/calendar page uses lifecycle APIs, calendar primitives, drag rescheduling and safe DOM rendering', () => {
  for (const name of ['listPosts', 'updatePost', 'cancelPost', 'duplicatePost', 'retryPublication', 'bulkCancelPosts', 'bulkReschedulePosts']) {
    assert.match(page, new RegExp(`\\b${name}\\b`));
  }
  assert.match(page, /getCalendarDays/);
  assert.match(page, /rescheduleIsoForDrop/);
  assert.match(page, /dragstart/);
  assert.match(page, /drop/);
  assert.doesNotMatch(page, /innerHTML/);
});

test('bulk lifecycle handlers clear selection before mutation refresh renders the queue', () => {
  const cancelHandler = page.match(/elements\.bulkCancel\?\.addEventListener\('click',[\s\S]*?\n  \}\);/)?.[0] ?? '';
  const rescheduleHandler = page.match(/elements\.bulkReschedule\?\.addEventListener\('click',[\s\S]*?\n  \}\);/)?.[0] ?? '';

  for (const handler of [cancelHandler, rescheduleHandler]) {
    assert.ok(handler, 'bulk handler source should be present');
    const clearIndex = handler.indexOf('state.selected.clear();');
    const mutateIndex = handler.indexOf('await mutate(');
    assert.ok(clearIndex >= 0, 'bulk handler should clear the selected set');
    assert.ok(mutateIndex >= 0, 'bulk handler should run a lifecycle mutation');
    assert.ok(clearIndex < mutateIndex, 'selection must clear before mutation-triggered refresh renders checkbox state');
  }
});

test('queue/calendar stylesheet includes responsive calendar and selection layouts', () => {
  assert.match(css, /\.calendar-grid/);
  assert.match(css, /\.queue-toolbar/);
  assert.match(css, /@media/);
});
