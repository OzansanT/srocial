import test from 'node:test';
import assert from 'node:assert/strict';
import { getHealthPayload } from '../server/routes/health.js';

test('health payload includes safe database health metadata', async () => {
  const payload = await getHealthPayload({
    async healthCheck() { return { ok: true, backend: 'json' }; }
  });
  assert.deepEqual(payload, {
    ok: true,
    service: 'srocial',
    version: '0.1.0',
    database: { ok: true, backend: 'json' }
  });
});

test('health payload sanitizes repository failures', async () => {
  const payload = await getHealthPayload({
    async healthCheck() { throw new Error('postgres://user:secret@example.test/private'); }
  });
  assert.deepEqual(payload, {
    ok: false,
    service: 'srocial',
    version: '0.1.0',
    database: { ok: false, backend: 'unavailable' }
  });
  assert.doesNotMatch(JSON.stringify(payload), /secret|example\.test|private/);
});
