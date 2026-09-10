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

test('does not start unless both scheduler and real publish gates are enabled', () => {
  for (const [enabled, allowRealPublish] of [[false, false], [true, false], [false, true]]) {
    const timer = timerHarness();
    const loop = startSchedulerLoop({ enabled, allowRealPublish, repository: {}, registry: new Map(), setIntervalImpl: timer.setIntervalImpl, clearIntervalImpl: timer.clearIntervalImpl });
    assert.equal(loop.started, false);
  }
});

test('starts recurring ticks when both gates are enabled', async () => {
  const timer = timerHarness();
  const calls = [];
  const loop = startSchedulerLoop({ enabled: true, allowRealPublish: true, repository: { name: 'repo' }, registry: new Map([['instagram', {}]]), intervalMs: 30000, workerId: 'worker-v6', setIntervalImpl: timer.setIntervalImpl, clearIntervalImpl: timer.clearIntervalImpl, tick: async (input) => { calls.push(input); return { claimed: 0 }; } });
  assert.equal(loop.started, true);
  await timer.fire();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workerId, 'worker-v6');
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
