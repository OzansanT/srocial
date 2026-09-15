import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonRepository } from '../server/db/json-repository.js';

async function withRepository(run, initial = null) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-users-'));
  const filePath = join(directory, 'db.json');
  if (initial) await writeFile(filePath, JSON.stringify(initial), 'utf8');
  const repository = createJsonRepository({ filePath });
  await repository.initialize();
  try {
    await run(repository, filePath);
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
}

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

test('JSON repository persists users and resolves normalized usernames defensively', async () => {
  await withRepository(async (repository, filePath) => {
    const created = await repository.createUser(userRecord());
    assert.ok(created.id);
    assert.equal((await repository.getUser(created.id)).username, 'operator');
    assert.equal((await repository.findUserByUsernameNormalized('operator')).id, created.id);
    assert.equal((await repository.listUsers()).length, 1);

    const listed = await repository.listUsers();
    listed[0].role = 'VIEWER';
    assert.equal((await repository.getUser(created.id)).role, 'ADMIN');

    const updated = await repository.updateUser(created.id, { displayName: 'Renamed', updatedAt: '2026-09-15T10:05:00.000Z' });
    assert.equal(updated.displayName, 'Renamed');
    assert.equal(updated.id, created.id);

    const persisted = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(persisted.users.length, 1);
    assert.equal(persisted.users[0].passwordHash, 'scrypt$v1$abc$def');
  });
});

test('JSON repository persists hashed sessions and supports single/all-session revocation', async () => {
  await withRepository(async (repository) => {
    const user = await repository.createUser(userRecord());
    const first = await repository.createUserSession({
      userId: user.id,
      tokenHash: 'hash-one',
      createdAt: CREATED_AT,
      expiresAt: '2026-09-15T11:00:00.000Z',
      revokedAt: null
    });
    const second = await repository.createUserSession({
      userId: user.id,
      tokenHash: 'hash-two',
      createdAt: CREATED_AT,
      expiresAt: '2026-09-15T11:00:00.000Z',
      revokedAt: null
    });

    assert.equal((await repository.findUserSessionByTokenHash('hash-one')).id, first.id);
    assert.equal((await repository.revokeUserSession(first.id, { revokedAt: '2026-09-15T10:10:00.000Z' })).revokedAt, '2026-09-15T10:10:00.000Z');
    const revoked = await repository.revokeUserSessionsForUser(user.id, { revokedAt: '2026-09-15T10:20:00.000Z' });
    assert.equal(revoked, 2);
    assert.equal((await repository.findUserSessionByTokenHash('hash-two')).revokedAt, '2026-09-15T10:20:00.000Z');
    assert.equal(second.userId, user.id);
  });
});

test('JSON repository loads pre-V21 files with empty users and sessions collections', async () => {
  await withRepository(async (repository) => {
    assert.deepEqual(await repository.listUsers(), []);
    assert.equal(await repository.findUserSessionByTokenHash('missing'), null);
  }, { posts: [], publications: [], jobs: [], accounts: [], oauthStates: [] });
});
