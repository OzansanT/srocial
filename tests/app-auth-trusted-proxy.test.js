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

const BASE_ENV = Object.freeze({
  APP_AUTH_ENABLED: 'true',
  ADMIN_USERNAME: 'operator',
  ADMIN_PASSWORD: 'correct-horse-battery',
  SESSION_SECRET: 's'.repeat(40),
  PUBLIC_BASE_URL: 'https://srocial.test',
  LOGIN_RATE_LIMIT_WINDOW_MS: '60000',
  LOGIN_RATE_LIMIT_MAX: '1'
});

async function withServer(env, run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-proxy-auth-'));
  const repository = createJsonRepository({ filePath: join(directory, 'auth.json') });
  await repository.initialize();
  const now = () => new Date('2026-09-16T08:00:00.000Z');
  const appAuth = createAppAuth({ env, repository, now });
  await appAuth.initialize();
  const server = createServer(createRequestHandler({ appAuth, now, publicBaseUrl: env.PUBLIC_BASE_URL }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
    await once(server, 'close');
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
}

function login(base, forwardedFor, password) {
  return fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://srocial.test',
      'x-forwarded-for': forwardedFor
    },
    body: JSON.stringify({ username: 'operator', password })
  });
}

test('trusted proxy rate limiting separates real forwarded clients', async () => {
  const env = { ...BASE_ENV, TRUSTED_PROXY_IPS: '127.0.0.1' };
  await withServer(env, async (base) => {
    assert.equal((await login(base, '198.51.100.10', 'wrong-password')).status, 401);
    assert.equal((await login(base, '198.51.100.10', 'correct-horse-battery')).status, 429);
    assert.equal((await login(base, '198.51.100.11', 'correct-horse-battery')).status, 200);
  });
});

test('untrusted peer ignores spoofed forwarded identities', async () => {
  await withServer(BASE_ENV, async (base) => {
    assert.equal((await login(base, '198.51.100.10', 'wrong-password')).status, 401);
    assert.equal((await login(base, '198.51.100.11', 'correct-horse-battery')).status, 429);
  });
});
