import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveChromeStartupTimeoutMs } from './e2e/browser-driver.js';

test('Chrome startup timeout has enough default headroom for cold CI launches', () => {
  assert.equal(resolveChromeStartupTimeoutMs({}), 30_000);
});

test('Chrome startup timeout accepts an explicit sane override', () => {
  assert.equal(resolveChromeStartupTimeoutMs({ E2E_CHROME_STARTUP_TIMEOUT_MS: '45000' }), 45_000);
});

test('Chrome startup timeout rejects malformed or dangerously tight overrides', () => {
  assert.equal(resolveChromeStartupTimeoutMs({ E2E_CHROME_STARTUP_TIMEOUT_MS: 'not-a-number' }), 30_000);
  assert.equal(resolveChromeStartupTimeoutMs({ E2E_CHROME_STARTUP_TIMEOUT_MS: '9999' }), 30_000);
});
