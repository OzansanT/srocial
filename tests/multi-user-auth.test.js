import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppAuth } from '../server/auth/create-app-auth.js';
import { hashPassword } from '../server/auth/password-hash.js';
import { createJsonRepository } from '../server/db/json-repository.js';

const FIXED_NOW = new Date('2026-09-15T11:00:00.000Z');
const ENV = Object.freeze({
  APP_AUTH_ENABLED: 'true',
  ADMIN_USERNAME: 'bootstrap-admin',
  ADMIN_PASSWORD: 'bootstrap-password-123',
  SESSION_SECRET: '0123456789abcdef0123456789abcdef',
  PUBLIC_BASE_URL: 'http://127.0.0.1:3000',
  SESSION_TTL_SECONDS: '3600'
});

async function withRepository(run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-auth-v21-'));
  const filePath = join(directory, 'db.json');
  const repository = createJsonRepository({ filePath });
  await repository.initialize();
  try {
    await run(repository, filePath);
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
}

function cookiePair(setCookie) {
  return String(setCookie).split(';', 1)[0];
}

test('enabled auth bootstraps the first repository administrator exactly once', async () => {
  await withRepository(async (repository) => {
    const auth = createAppAuth({ env: ENV, repository, now: () => FIXED_NOW });
    await auth.initialize();
    await auth.initialize();

    const users = await repository.listUsers();
    assert.equal(users.length, 1);
    assert.equal(users[0].username, 'bootstrap-admin');
    assert.equal(users[0].usernameNormalized, 'bootstrap-admin');
    assert.equal(users[0].role, 'ADMIN');
    assert.equal(users[0].status, 'ACTIVE');
    assert.notEqual(users[0].passwordHash, ENV.ADMIN_PASSWORD);
    assert.equal(users[0].passwordHash.includes(ENV.ADMIN_PASSWORD), false);
  });
});

test('once a repository user exists environment credentials are not a parallel login bypass', async () => {
  await withRepository(async (repository) => {
    const createdAt = FIXED_NOW.toISOString();
    await repository.createUser({
      username: 'alice',
      usernameNormalized: 'alice',
      displayName: 'Alice',
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash: await hashPassword('alice-password-123'),
      createdAt,
      updatedAt: createdAt
    });

    const auth = createAppAuth({ env: ENV, repository, now: () => FIXED_NOW });
    await auth.initialize();
    assert.equal((await repository.listUsers()).length, 1);
    assert.equal((await auth.login({ username: ENV.ADMIN_USERNAME, password: ENV.ADMIN_PASSWORD })).statusCode, 401);
    assert.equal((await auth.login({ username: 'alice', password: 'alice-password-123' })).statusCode, 200);
  });
});

test('login issues an opaque cookie while persistence contains only its hash and safe user identity', async () => {
  await withRepository(async (repository, filePath) => {
    const auth = createAppAuth({ env: ENV, repository, now: () => FIXED_NOW });
    await auth.initialize();

    const login = await auth.login({ username: ENV.ADMIN_USERNAME, password: ENV.ADMIN_PASSWORD });
    assert.equal(login.statusCode, 200);
    assert.match(login.setCookie, /^srocial_session=[A-Za-z0-9_-]+;/);
    const cookie = cookiePair(login.setCookie);
    const rawToken = cookie.slice(cookie.indexOf('=') + 1);

    const persisted = await readFile(filePath, 'utf8');
    assert.equal(persisted.includes(rawToken), false);
    assert.equal(persisted.includes(ENV.ADMIN_PASSWORD), false);

    const session = await auth.readSession({ headers: { cookie } });
    assert.ok(session.sessionId);
    assert.deepEqual(session.user, {
      id: (await repository.listUsers())[0].id,
      username: 'bootstrap-admin',
      displayName: 'bootstrap-admin',
      role: 'ADMIN'
    });
  });
});

test('logout revokes the repository session and clears the browser cookie', async () => {
  await withRepository(async (repository) => {
    const auth = createAppAuth({ env: ENV, repository, now: () => FIXED_NOW });
    await auth.initialize();
    const login = await auth.login({ username: ENV.ADMIN_USERNAME, password: ENV.ADMIN_PASSWORD });
    const cookie = cookiePair(login.setCookie);
    const session = await auth.readSession({ headers: { cookie } });

    const logout = await auth.logout(session);
    assert.match(logout.setCookie, /^srocial_session=;/);
    assert.equal(await auth.readSession({ headers: { cookie } }), null);
  });
});

test('disabled users cannot log in and invalidate already issued sessions', async () => {
  await withRepository(async (repository) => {
    const auth = createAppAuth({ env: ENV, repository, now: () => FIXED_NOW });
    await auth.initialize();
    const login = await auth.login({ username: ENV.ADMIN_USERNAME, password: ENV.ADMIN_PASSWORD });
    const cookie = cookiePair(login.setCookie);
    const user = (await repository.listUsers())[0];

    await repository.updateUser(user.id, { status: 'DISABLED', updatedAt: FIXED_NOW.toISOString() });
    assert.equal(await auth.readSession({ headers: { cookie } }), null);
    assert.equal((await auth.login({ username: ENV.ADMIN_USERNAME, password: ENV.ADMIN_PASSWORD })).statusCode, 401);
  });
});
