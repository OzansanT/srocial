import test from 'node:test';
import assert from 'node:assert/strict';
import { startSchedulerLoop } from '../server/scheduler/start-scheduler-loop.js';

function timerHarness() {
  let callback = null;
  let cleared = null;
  return {
    setIntervalImpl(fn) { callback = fn; return 'timer-1'; },
    clearIntervalImpl(id) { cleared = id; },
    fire() { return callback?.(); },
    get cleared() { return cleared; }
  };
}

function sequencedNow(...values) {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]);
}

test('does not start unless both scheduler and real publish gates are enabled', () => {
  for (const [enabled, allowRealPublish] of [[false, false], [true, false], [false, true]]) {
    const timer = timerHarness();
    const loop = startSchedulerLoop({ enabled, allowRealPublish, repository: {}, registry: new Map(), setIntervalImpl: timer.setIntervalImpl, clearIntervalImpl: timer.clearIntervalImpl });
    assert.equal(loop.started, false);
  }
});

test('disabled scheduler exposes a stopped health status without requiring runtime dependencies', () => {
  const loop = startSchedulerLoop({ enabled: true, allowRealPublish: false, intervalMs: 2500 });
  assert.deepEqual(loop.status(), {
    configured: true,
    running: false,
    stopped: true,
    inFlight: false,
    intervalMs: 2500,
    lastTickStartedAt: null,
    lastSuccessfulTickAt: null,
    lastFailedTickAt: null,
    lastErrorCode: null
  });
});

test('starts recurring ticks and passes provider and token-refresh dependencies', async () => {
  const timer = timerHarness();
  const calls = [];
  const oauthRegistry = new Map([['instagram', { refreshAccessToken() {} }]]);
  const tokenCipher = { encrypt() {}, decrypt() {} };
  const loop = startSchedulerLoop({
    enabled: true,
    allowRealPublish: true,
    repository: { name: 'repo' },
    registry: new Map([['instagram', {}]]),
    oauthRegistry,
    tokenCipher,
    intervalMs: 30000,
    workerId: 'worker-v6',
    setIntervalImpl: timer.setIntervalImpl,
    clearIntervalImpl: timer.clearIntervalImpl,
    tick: async (input) => { calls.push(input); return { claimed: 0 }; }
  });
  assert.equal(loop.started, true);
  await timer.fire();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workerId, 'worker-v6');
  assert.equal(calls[0].oauthRegistry, oauthRegistry);
  assert.equal(calls[0].tokenCipher, tokenCipher);
});

test('scheduler health tracks in-flight and successful ticks with deterministic time', async () => {
  const timer = timerHarness();
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const loop = startSchedulerLoop({
    enabled: true,
    allowRealPublish: true,
    repository: {},
    registry: new Map([['instagram', {}]]),
    intervalMs: 5000,
    setIntervalImpl: timer.setIntervalImpl,
    clearIntervalImpl: timer.clearIntervalImpl,
    now: sequencedNow('2026-09-16T10:00:00.000Z', '2026-09-16T10:00:01.000Z'),
    tick: async () => { await pending; return {}; }
  });

  assert.deepEqual(loop.status(), {
    configured: true,
    running: true,
    stopped: false,
    inFlight: false,
    intervalMs: 5000,
    lastTickStartedAt: null,
    lastSuccessfulTickAt: null,
    lastFailedTickAt: null,
    lastErrorCode: null
  });

  const inFlight = timer.fire();
  assert.deepEqual(loop.status(), {
    configured: true,
    running: true,
    stopped: false,
    inFlight: true,
    intervalMs: 5000,
    lastTickStartedAt: '2026-09-16T10:00:00.000Z',
    lastSuccessfulTickAt: null,
    lastFailedTickAt: null,
    lastErrorCode: null
  });

  release();
  await inFlight;
  assert.deepEqual(loop.status(), {
    configured: true,
    running: true,
    stopped: false,
    inFlight: false,
    intervalMs: 5000,
    lastTickStartedAt: '2026-09-16T10:00:00.000Z',
    lastSuccessfulTickAt: '2026-09-16T10:00:01.000Z',
    lastFailedTickAt: null,
    lastErrorCode: null
  });
});

test('scheduler health records sanitized tick failure and stop state', async () => {
  const timer = timerHarness();
  const logs = [];
  const loop = startSchedulerLoop({
    enabled: true,
    allowRealPublish: true,
    repository: {},
    registry: new Map([['instagram', {}]]),
    setIntervalImpl: timer.setIntervalImpl,
    clearIntervalImpl: timer.clearIntervalImpl,
    now: sequencedNow('2026-09-16T11:00:00.000Z', '2026-09-16T11:00:02.000Z'),
    logger: { error(message, detail) { logs.push({ message, detail }); } },
    tick: async () => { throw Object.assign(new Error('provider secret detail'), { code: 'SAFE_TICK_CODE' }); }
  });

  await timer.fire();
  assert.deepEqual(loop.status(), {
    configured: true,
    running: true,
    stopped: false,
    inFlight: false,
    intervalMs: 30000,
    lastTickStartedAt: '2026-09-16T11:00:00.000Z',
    lastSuccessfulTickAt: null,
    lastFailedTickAt: '2026-09-16T11:00:02.000Z',
    lastErrorCode: 'SAFE_TICK_CODE'
  });
  assert.deepEqual(logs, [{ message: 'Scheduler tick failed', detail: { code: 'SAFE_TICK_CODE' } }]);
  assert.equal(JSON.stringify(loop.status()).includes('provider secret detail'), false);

  loop.stop();
  assert.equal(loop.status().running, false);
  assert.equal(loop.status().stopped, true);
  assert.equal(timer.cleared, 'timer-1');
});

test('skips overlapping interval callbacks while a tick is in flight', async () => {
  const timer = timerHarness();
  let release;
  let calls = 0;
  const pending = new Promise((resolve) => { release = resolve; });
  startSchedulerLoop({ enabled: true, allowRealPublish: true, repository: {}, registry: new Map([['instagram', {}]]), setIntervalImpl: timer.setIntervalImpl, clearIntervalImpl: timer.clearIntervalImpl, tick: async () => { calls += 1; await pending; return {}; } });
  const first = timer.fire();
  const second = timer.fire();
  assert.equal(calls, 1);
  release();
  await first;
  await second;
});

test('stop clears the recurring timer', () => {
  const timer = timerHarness();
  const loop = startSchedulerLoop({ enabled: true, allowRealPublish: true, repository: {}, registry: new Map([['instagram', {}]]), setIntervalImpl: timer.setIntervalImpl, clearIntervalImpl: timer.clearIntervalImpl, tick: async () => ({}) });
  loop.stop();
  assert.equal(timer.cleared, 'timer-1');
});
