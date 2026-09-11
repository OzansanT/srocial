import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixedWindowLimiter } from '../server/http/fixed-window-limiter.js';

test('fixed-window limiter allows configured requests and then returns retry timing', () => {
  let current = 1_000;
  const limiter = createFixedWindowLimiter({ windowMs: 10_000, max: 2, now: () => current });

  assert.deepEqual(limiter.consume('client-a'), { allowed: true, retryAfterSeconds: 0, remaining: 1 });
  assert.deepEqual(limiter.consume('client-a'), { allowed: true, retryAfterSeconds: 0, remaining: 0 });
  const blocked = limiter.consume('client-a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds, 10);

  assert.equal(limiter.consume('client-b').allowed, true);

  current = 11_001;
  assert.deepEqual(limiter.consume('client-a'), { allowed: true, retryAfterSeconds: 0, remaining: 1 });
});

test('fixed-window limiter reset clears one client bucket', () => {
  const limiter = createFixedWindowLimiter({ windowMs: 1000, max: 1, now: () => 100 });
  assert.equal(limiter.consume('client-a').allowed, true);
  assert.equal(limiter.consume('client-a').allowed, false);
  limiter.reset('client-a');
  assert.equal(limiter.consume('client-a').allowed, true);
});

test('fixed-window limiter rejects invalid configuration', () => {
  assert.throws(() => createFixedWindowLimiter({ windowMs: 0, max: 1 }), TypeError);
  assert.throws(() => createFixedWindowLimiter({ windowMs: 1000, max: 0 }), TypeError);
});
