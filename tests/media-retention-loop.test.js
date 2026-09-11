import test from 'node:test';
import assert from 'node:assert/strict';
import { startMediaRetentionLoop } from '../server/scheduler/start-media-retention-loop.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('disabled retention loop schedules nothing', () => {
  let scheduled = false;
  const loop = startMediaRetentionLoop({
    enabled: false,
    repository: {},
    mediaStore: {},
    cleanup: async () => {},
    setIntervalImpl() { scheduled = true; }
  });
  assert.equal(loop.started, false);
  assert.equal(scheduled, false);
  loop.stop();
});

test('enabled loop schedules bounded cleanup with normalized configuration', async () => {
  let callback;
  let interval;
  const calls = [];
  const loop = startMediaRetentionLoop({
    enabled: true,
    repository: { id: 'repo' },
    mediaStore: { id: 'store' },
    retentionMs: 1234,
    intervalMs: 5678,
    maxDeletes: 9,
    now: () => new Date('2026-09-11T00:00:00Z'),
    cleanup: async (input) => { calls.push(input); },
    setIntervalImpl(fn, ms) { callback = fn; interval = ms; return 42; },
    clearIntervalImpl() {}
  });
  assert.equal(loop.started, true);
  assert.equal(interval, 5678);
  await callback();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].retentionMs, 1234);
  assert.equal(calls[0].maxDeletes, 9);
  assert.equal(calls[0].now.toISOString(), '2026-09-11T00:00:00.000Z');
});

test('skips overlapping cleanup callbacks', async () => {
  let callback;
  const gate = deferred();
  let calls = 0;
  const loop = startMediaRetentionLoop({
    enabled: true,
    repository: {}, mediaStore: {},
    cleanup: async () => { calls += 1; await gate.promise; },
    setIntervalImpl(fn) { callback = fn; return 1; }, clearIntervalImpl() {}
  });
  const first = callback();
  await Promise.resolve();
  await callback();
  assert.equal(calls, 1);
  gate.resolve();
  await first;
  loop.stop();
});

test('logs only a safe cleanup error code and keeps the loop alive', async () => {
  let callback;
  const errors = [];
  startMediaRetentionLoop({
    enabled: true,
    repository: {}, mediaStore: {},
    cleanup: async () => { throw Object.assign(new Error('secret object-store response'), { code: 'MEDIA_RETENTION_CLEANUP_FAILED' }); },
    logger: { error(message, metadata) { errors.push({ message, metadata }); } },
    setIntervalImpl(fn) { callback = fn; return 1; }, clearIntervalImpl() {}
  });
  await callback();
  assert.deepEqual(errors, [{ message: 'Media retention cleanup failed', metadata: { code: 'MEDIA_RETENTION_CLEANUP_FAILED' } }]);
  assert.equal(JSON.stringify(errors).includes('secret object-store response'), false);
});

test('stop clears the timer once and prevents later callbacks from running', async () => {
  let callback;
  let clears = 0;
  let calls = 0;
  const loop = startMediaRetentionLoop({
    enabled: true,
    repository: {}, mediaStore: {}, cleanup: async () => { calls += 1; },
    setIntervalImpl(fn) { callback = fn; return 99; },
    clearIntervalImpl(id) { assert.equal(id, 99); clears += 1; }
  });
  loop.stop();
  loop.stop();
  await callback();
  assert.equal(clears, 1);
  assert.equal(calls, 0);
});
