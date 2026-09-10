import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyExecutionError, getRetryDelayMs } from '../server/scheduler/retry-policy.js';

test('retry delay uses bounded 1m, 5m, 15m, then 60m schedule', () => {
  assert.equal(getRetryDelayMs(1), 60_000);
  assert.equal(getRetryDelayMs(2), 300_000);
  assert.equal(getRetryDelayMs(3), 900_000);
  assert.equal(getRetryDelayMs(4), 3_600_000);
  assert.equal(getRetryDelayMs(20), 3_600_000);
});

test('classifies network and rate limit failures as retryable', () => {
  assert.deepEqual(classifyExecutionError({ code: 'NETWORK_ERROR' }), { code: 'NETWORK_ERROR', retryable: true });
  assert.deepEqual(classifyExecutionError({ code: 'RATE_LIMIT' }), { code: 'RATE_LIMIT', retryable: true });
});

test('honors an explicit retryable flag from a provider adapter', () => {
  assert.deepEqual(classifyExecutionError({ code: 'CUSTOM_TRANSIENT', retryable: true }), { code: 'CUSTOM_TRANSIENT', retryable: true });
  assert.deepEqual(classifyExecutionError({ code: 'NETWORK_ERROR', retryable: false }), { code: 'NETWORK_ERROR', retryable: false });
});

test('treats authentication and unknown failures as permanent by default', () => {
  assert.deepEqual(classifyExecutionError({ code: 'AUTH_ERROR' }), { code: 'AUTH_ERROR', retryable: false });
  assert.deepEqual(classifyExecutionError(new Error('boom')), { code: 'PROVIDER_ERROR', retryable: false });
});
