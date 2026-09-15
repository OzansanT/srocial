import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresRepository } from '../server/db/postgres-repository.js';
import {
  clearPostgresRuntimeTables,
  dropPostgresTestSchema,
  hasPostgresTestDatabase,
  preparePostgresTestSchema
} from './helpers/postgres-test-db.js';

const enabled = hasPostgresTestDatabase();
const schema = 'test_users_v21';
let pool;
let repository;

before(async () => {
  if (!enabled) return;
  pool = await preparePostgresTestSchema(schema);
  repository = createPostgresRepository({ pool });
});

beforeEach(async () => {
  if (!enabled) return;
  await clearPostgresRuntimeTables(pool);
});

after(async () => {
  if (!enabled) return;
  await pool.end();
  await dropPostgresTestSchema(schema);
});

const CREATED_AT = '2026-09-15T10:00:00.000Z';

function userRecord(overrides = {}) {
  return {
    username: 'operator',
    usernameNormalized: 'operator',
    displayName: 'Primary Operator',
    role: 'ADMIN',
    status: 'ACTIVE',
    passwordHash: 'scrypt$v1$abc$def',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides
  };
}

test('PostgreSQL migration exposes user/session tables and repository initializes', { skip: !enabled }, async () => {
  await repository.initialize();
  const result = await pool.query("SELECT to_regclass('app_users') AS users, to_regclass('app_user_sessions') AS sessions");
  assert.equal(result.rows[0].users, 'app_users');
  assert.equal(result.rows[0].sessions, 'app_user_sessions');
});

test('PostgreSQL users enforce normalized username uniqueness and round-trip safe fields', { skip: !enabled }, async () => {
  const created = await repository.createUser(userRecord());
  assert.equal(created.usernameNormalized, 'operator');
  assert.equal((await repository.getUser(created.id)).passwordHash, 'scrypt$v1$abc$def');
  assert.equal((await repository.findUserByUsernameNormalized('operator')).id, created.id);
  assert.equal((await repository.listUsers()).length, 1);

  await assert.rejects(
    () => repository.createUser(userRecord({ username: 'Operator Two', usernameNormalized: 'operator' })),
    /duplicate|unique/i
  );

  const updated = await repository.updateUser(created.id, { role: 'MANAGER', updatedAt: '2026-09-15T10:05:00.000Z' });
  assert.equal(updated.role, 'MANAGER');
});

test('PostgreSQL admin continuity is serialized across concurrent demotions', { skip: !enabled }, async () => {
  const first = await repository.createUser(userRecord({ username: 'admin-one', usernameNormalized: 'admin-one' }));
  const second = await repository.createUser(userRecord({ username: 'admin-two', usernameNormalized: 'admin-two' }));

  const outcomes = await Promise.allSettled([
    repository.updateUserWithAdminContinuity(first.id, { role: 'MANAGER', updatedAt: '2026-09-15T10:05:00.000Z' }),
    repository.updateUserWithAdminContinuity(second.id, { role: 'MANAGER', updatedAt: '2026-09-15T10:05:00.000Z' })
  ]);

  assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((item) => item.status === 'rejected' && item.reason?.message === 'LAST_ADMIN_FORBIDDEN').length, 1);
  const users = await repository.listUsers();
  assert.equal(users.filter((user) => user.role === 'ADMIN' && user.status === 'ACTIVE').length, 1);
});

test('PostgreSQL sessions are looked up by hash and can be revoked per session or user', { skip: !enabled }, async () => {
  const user = await repository.createUser(userRecord());
  const first = await repository.createUserSession({
    userId: user.id,
    tokenHash: 'hash-one',
    createdAt: CREATED_AT,
    expiresAt: '2026-09-15T11:00:00.000Z',
    revokedAt: null
  });
  await repository.createUserSession({
    userId: user.id,
    tokenHash: 'hash-two',
    createdAt: CREATED_AT,
    expiresAt: '2026-09-15T11:00:00.000Z',
    revokedAt: null
  });

  assert.equal((await repository.findUserSessionByTokenHash('hash-one')).userId, user.id);
  assert.equal((await repository.revokeUserSession(first.id, { revokedAt: '2026-09-15T10:10:00.000Z' })).revokedAt, '2026-09-15T10:10:00.000Z');
  assert.equal(await repository.revokeUserSessionsForUser(user.id, { revokedAt: '2026-09-15T10:20:00.000Z' }), 2);
  assert.equal((await repository.findUserSessionByTokenHash('hash-two')).revokedAt, '2026-09-15T10:20:00.000Z');
});
