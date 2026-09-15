import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequestHandler } from '../server/app.js';
import { createAppAuth } from '../server/auth/create-app-auth.js';
import { createJsonRepository } from '../server/db/json-repository.js';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const ENV = Object.freeze({
  APP_AUTH_ENABLED: 'true',
  ADMIN_USERNAME: 'operator',
  ADMIN_PASSWORD: 'correct-horse-battery',
  SESSION_SECRET: 'u'.repeat(40),
  SESSION_TTL_SECONDS: '3600',
  PUBLIC_BASE_URL: 'https://srocial.test'
});

async function withServer(run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-users-api-'));
  const repository = createJsonRepository({ filePath: join(directory, 'db.json') });
  await repository.initialize();
  const now = () => NOW;
  const appAuth = createAppAuth({ env: ENV, repository, now });
  await appAuth.initialize();
  const server = createServer(createRequestHandler({ repository, appAuth, publicBaseUrl: ENV.PUBLIC_BASE_URL, now }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`, repository);
  } finally {
    server.close();
    await once(server, 'close');
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function login(base, username = 'operator', password = 'correct-horse-battery') {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ENV.PUBLIC_BASE_URL },
    body: JSON.stringify({ username, password })
  });
  const setCookie = response.headers.get('set-cookie');
  return { response, cookie: setCookie ? setCookie.split(';', 1)[0] : null };
}

function mutationHeaders(cookie) {
  return { cookie, origin: ENV.PUBLIC_BASE_URL, 'content-type': 'application/json', accept: 'application/json' };
}

test('Admin can list and create users without exposing password hashes', async () => {
  await withServer(async (base, repository) => {
    const { cookie } = await login(base);
    const before = await fetch(`${base}/api/users`, { headers: { cookie, accept: 'application/json' } });
    assert.equal(before.status, 200);
    const beforePayload = await before.json();
    assert.equal(beforePayload.users.length, 1);
    assert.equal(Object.hasOwn(beforePayload.users[0], 'passwordHash'), false);

    const created = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: mutationHeaders(cookie),
      body: JSON.stringify({
        username: 'manager.one',
        displayName: 'Operations Manager',
        role: 'MANAGER',
        password: 'manager-password-123'
      })
    });
    assert.equal(created.status, 201);
    const payload = await created.json();
    assert.equal(payload.user.username, 'manager.one');
    assert.equal(payload.user.role, 'MANAGER');
    assert.equal(payload.user.status, 'ACTIVE');
    assert.equal(Object.hasOwn(payload.user, 'passwordHash'), false);

    const stored = await repository.findUserByUsernameNormalized('manager.one');
    assert.ok(stored.passwordHash.startsWith('scrypt$v1$'));
    assert.equal(stored.passwordHash.includes('manager-password-123'), false);
  });
});

test('Admin can update profile/role and new sessions immediately observe the current role', async () => {
  await withServer(async (base) => {
    const { cookie: adminCookie } = await login(base);
    const created = await fetch(`${base}/api/users`, {
      method: 'POST', headers: mutationHeaders(adminCookie),
      body: JSON.stringify({ username: 'creator.one', displayName: 'Creator One', role: 'MANAGER', password: 'creator-password-123' })
    });
    const createdUser = (await created.json()).user;

    const update = await fetch(`${base}/api/users/${encodeURIComponent(createdUser.id)}`, {
      method: 'PATCH', headers: mutationHeaders(adminCookie),
      body: JSON.stringify({ displayName: 'Creator Renamed', role: 'EDITOR' })
    });
    assert.equal(update.status, 200);
    const updated = (await update.json()).user;
    assert.equal(updated.displayName, 'Creator Renamed');
    assert.equal(updated.role, 'EDITOR');

    const signedIn = await login(base, 'creator.one', 'creator-password-123');
    assert.equal(signedIn.response.status, 200);
    const session = await fetch(`${base}/api/auth/session`, { headers: { cookie: signedIn.cookie } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).user.role, 'EDITOR');
  });
});

test('password changes and explicit session revocation invalidate existing user sessions', async () => {
  await withServer(async (base) => {
    const { cookie: adminCookie } = await login(base);
    const created = await fetch(`${base}/api/users`, {
      method: 'POST', headers: mutationHeaders(adminCookie),
      body: JSON.stringify({ username: 'editor.one', displayName: 'Editor One', role: 'EDITOR', password: 'editor-password-123' })
    });
    const user = (await created.json()).user;

    const oldLogin = await login(base, 'editor.one', 'editor-password-123');
    assert.equal(oldLogin.response.status, 200);
    const passwordChange = await fetch(`${base}/api/users/${encodeURIComponent(user.id)}/password`, {
      method: 'POST', headers: mutationHeaders(adminCookie),
      body: JSON.stringify({ password: 'editor-password-456' })
    });
    assert.equal(passwordChange.status, 200);
    assert.equal((await fetch(`${base}/api/auth/session`, { headers: { cookie: oldLogin.cookie } })).status, 401);
    assert.equal((await login(base, 'editor.one', 'editor-password-123')).response.status, 401);

    const freshLogin = await login(base, 'editor.one', 'editor-password-456');
    assert.equal(freshLogin.response.status, 200);
    const revoke = await fetch(`${base}/api/users/${encodeURIComponent(user.id)}/sessions/revoke`, {
      method: 'POST', headers: mutationHeaders(adminCookie), body: '{}'
    });
    assert.equal(revoke.status, 200);
    assert.equal((await fetch(`${base}/api/auth/session`, { headers: { cookie: freshLogin.cookie } })).status, 401);
  });
});

test('user management rejects duplicate usernames, invalid input, and administrator self-lockout', async () => {
  await withServer(async (base, repository) => {
    const { cookie } = await login(base);
    const admin = (await repository.listUsers())[0];

    const duplicate = await fetch(`${base}/api/users`, {
      method: 'POST', headers: mutationHeaders(cookie),
      body: JSON.stringify({ username: 'OPERATOR', displayName: 'Duplicate', role: 'VIEWER', password: 'duplicate-password-123' })
    });
    assert.equal(duplicate.status, 409);
    assert.deepEqual(await duplicate.json(), { error: 'username_conflict' });

    const weak = await fetch(`${base}/api/users`, {
      method: 'POST', headers: mutationHeaders(cookie),
      body: JSON.stringify({ username: 'weak.user', displayName: 'Weak', role: 'VIEWER', password: 'short' })
    });
    assert.equal(weak.status, 400);
    assert.deepEqual(await weak.json(), { error: 'validation_error' });

    const selfDemote = await fetch(`${base}/api/users/${encodeURIComponent(admin.id)}`, {
      method: 'PATCH', headers: mutationHeaders(cookie), body: JSON.stringify({ role: 'VIEWER' })
    });
    assert.equal(selfDemote.status, 409);
    assert.deepEqual(await selfDemote.json(), { error: 'self_lockout_forbidden' });

    const selfDisable = await fetch(`${base}/api/users/${encodeURIComponent(admin.id)}`, {
      method: 'PATCH', headers: mutationHeaders(cookie), body: JSON.stringify({ status: 'DISABLED' })
    });
    assert.equal(selfDisable.status, 409);
    assert.deepEqual(await selfDisable.json(), { error: 'self_lockout_forbidden' });
  });
});
