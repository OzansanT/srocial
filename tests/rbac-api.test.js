import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequestHandler } from '../server/app.js';
import { createAppAuth } from '../server/auth/create-app-auth.js';
import { hashPassword } from '../server/auth/password-hash.js';
import { createJsonRepository } from '../server/db/json-repository.js';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const ENV = Object.freeze({
  APP_AUTH_ENABLED: 'true',
  ADMIN_USERNAME: 'bootstrap-unused',
  ADMIN_PASSWORD: 'bootstrap-password-123',
  SESSION_SECRET: 'r'.repeat(40),
  SESSION_TTL_SECONDS: '3600',
  PUBLIC_BASE_URL: 'https://srocial.test'
});

async function seedUser(repository, username, role) {
  const timestamp = NOW.toISOString();
  return repository.createUser({
    username,
    usernameNormalized: username,
    displayName: username,
    role,
    status: 'ACTIVE',
    passwordHash: await hashPassword(`${username}-password-123`),
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

async function withServer(run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-rbac-'));
  const repository = createJsonRepository({ filePath: join(directory, 'db.json') });
  await repository.initialize();
  await seedUser(repository, 'viewer', 'VIEWER');
  await seedUser(repository, 'editor', 'EDITOR');
  await seedUser(repository, 'manager', 'MANAGER');
  await seedUser(repository, 'admin', 'ADMIN');
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

async function login(base, username) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ENV.PUBLIC_BASE_URL },
    body: JSON.stringify({ username, password: `${username}-password-123` })
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';', 1)[0];
}

function mutationHeaders(cookie) {
  return { cookie, origin: ENV.PUBLIC_BASE_URL, 'content-type': 'application/json', accept: 'application/json' };
}

test('Viewer is read-only and cannot access Admin user management', async () => {
  await withServer(async (base, repository) => {
    const cookie = await login(base, 'viewer');
    assert.equal((await fetch(`${base}/api/dashboard`, { headers: { cookie } })).status, 200);
    assert.equal((await fetch(`${base}/api/users`, { headers: { cookie } })).status, 403);

    const create = await fetch(`${base}/api/posts`, {
      method: 'POST', headers: mutationHeaders(cookie),
      body: JSON.stringify({ caption: 'blocked', platforms: ['facebook'], scheduledAt: '2026-09-16T10:00:00.000Z' })
    });
    assert.equal(create.status, 403);
    assert.deepEqual(await create.json(), { error: 'forbidden' });
    assert.equal((await repository.listPostOperations()).length, 0);
  });
});

test('Editor may manage social content but cannot manage provider accounts', async () => {
  await withServer(async (base) => {
    const cookie = await login(base, 'editor');
    const create = await fetch(`${base}/api/posts`, {
      method: 'POST', headers: mutationHeaders(cookie),
      body: JSON.stringify({ caption: 'editor post', platforms: ['facebook'], scheduledAt: '2026-09-16T10:00:00.000Z' })
    });
    assert.equal(create.status, 201);

    const oauth = await fetch(`${base}/api/oauth/instagram/start`, {
      method: 'POST', headers: mutationHeaders(cookie), body: '{}'
    });
    assert.equal(oauth.status, 403);
    assert.deepEqual(await oauth.json(), { error: 'forbidden' });
  });
});

test('Manager reaches operational administration but cannot administer application users', async () => {
  await withServer(async (base) => {
    const cookie = await login(base, 'manager');
    const oauth = await fetch(`${base}/api/oauth/instagram/start`, {
      method: 'POST', headers: mutationHeaders(cookie), body: '{}'
    });
    assert.equal(oauth.status, 400);
    assert.deepEqual(await oauth.json(), { error: 'unsupported_provider' });

    const users = await fetch(`${base}/api/users`, { headers: { cookie } });
    assert.equal(users.status, 403);
    assert.deepEqual(await users.json(), { error: 'forbidden' });
  });
});

test('Admin may administer users while unknown protected mutations fail closed for lower roles', async () => {
  await withServer(async (base) => {
    const managerCookie = await login(base, 'manager');
    const managerUnknown = await fetch(`${base}/api/future-dangerous-action`, {
      method: 'POST', headers: mutationHeaders(managerCookie), body: '{}'
    });
    assert.equal(managerUnknown.status, 403);

    const adminCookie = await login(base, 'admin');
    const created = await fetch(`${base}/api/users`, {
      method: 'POST', headers: mutationHeaders(adminCookie),
      body: JSON.stringify({ username: 'new.viewer', displayName: 'New Viewer', role: 'VIEWER', password: 'new-viewer-password-123' })
    });
    assert.equal(created.status, 201);

    const adminUnknown = await fetch(`${base}/api/future-dangerous-action`, {
      method: 'POST', headers: mutationHeaders(adminCookie), body: '{}'
    });
    assert.equal(adminUnknown.status, 405);
  });
});
