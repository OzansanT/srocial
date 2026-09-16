import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresRepository } from '../server/db/postgres-repository.js';
import {
  dropPostgresTestSchema,
  hasPostgresTestDatabase,
  preparePostgresTestSchema
} from './helpers/postgres-test-db.js';

const enabled = hasPostgresTestDatabase();
const schema = 'test_rate_limit_v26';
let pool;
let first;
let second;

before(async () => {
  if (!enabled) return;
  pool = await preparePostgresTestSchema(schema);
  first = createPostgresRepository({ pool });
  second = createPostgresRepository({ pool });
  await first.initialize();
});

after(async () => {
  if (!enabled) return;
  await pool.end();
  await dropPostgresTestSchema(schema);
});

test('PostgreSQL rate limits are shared across repository instances', { skip: !enabled }, async () => {
  const input = { scope: 'login', key: '198.51.100.7', windowMs: 60_000, max: 2, nowMs: 1_000_000 };
  assert.deepEqual(await first.consumeRateLimit(input), { allowed: true, retryAfterSeconds: 0, remaining: 1 });
  assert.deepEqual(await second.consumeRateLimit(input), { allowed: true, retryAfterSeconds: 0, remaining: 0 });
  assert.deepEqual(await first.consumeRateLimit(input), { allowed: false, retryAfterSeconds: 60, remaining: 0 });
});

test('PostgreSQL rate limit claim is atomic under concurrent cross-instance consumption', { skip: !enabled }, async () => {
  const input = { scope: 'api', key: '203.0.113.5', windowMs: 60_000, max: 1, nowMs: 2_000_000 };
  const results = await Promise.all([first.consumeRateLimit(input), second.consumeRateLimit(input)]);
  assert.equal(results.filter((result) => result.allowed).length, 1);
  assert.equal(results.filter((result) => !result.allowed).length, 1);
});

test('PostgreSQL rate limit opens a new bucket after the fixed window expires', { skip: !enabled }, async () => {
  const input = { scope: 'login', key: '192.0.2.8', windowMs: 1_000, max: 1, nowMs: 3_000_000 };
  assert.equal((await first.consumeRateLimit(input)).allowed, true);
  assert.equal((await second.consumeRateLimit(input)).allowed, false);
  assert.deepEqual(
    await second.consumeRateLimit({ ...input, nowMs: 3_001_000 }),
    { allowed: true, retryAfterSeconds: 0, remaining: 0 }
  );
});
