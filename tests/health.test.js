import test from 'node:test';
import assert from 'node:assert/strict';
import { getHealthPayload } from '../server/routes/health.js';

test('health payload identifies a healthy Srocial service', () => {
  assert.deepEqual(getHealthPayload(), {
    ok: true,
    service: 'srocial',
    version: '0.1.0'
  });
});
