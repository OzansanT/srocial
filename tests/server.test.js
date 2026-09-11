import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequestHandler } from '../server/app.js';

async function withServer(run, options = {}) {
  const server = createServer(createRequestHandler(options));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('GET /api/health returns service and database health JSON', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.deepEqual(await response.json(), {
      ok: true,
      service: 'srocial',
      version: '0.1.0',
      database: { ok: true, backend: 'json' }
    });
  }, {
    repository: { async healthCheck() { return { ok: true, backend: 'json' }; } }
  });
});

test('GET /api/health returns 503 without leaking repository failures', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.deepEqual(payload.database, { ok: false, backend: 'unavailable' });
    assert.doesNotMatch(JSON.stringify(payload), /secret|database\.internal/);
  }, {
    repository: {
      async healthCheck() { throw new Error('postgres://user:secret@database.internal/srocial'); }
    }
  });
});

test('GET /api/dashboard returns the five configured channels', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dashboard`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.channels.length, 5);
    assert.deepEqual(payload.counts, { scheduled: 0, published: 0, processing: 0, failed: 0 });
  });
});

test('GET / serves the dashboard HTML', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Srocial Dashboard/);
  });
});
