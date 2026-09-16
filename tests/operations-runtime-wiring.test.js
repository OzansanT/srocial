import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequestHandler } from '../server/app.js';

const repository = {
  async listProviderStatuses() { return []; },
  async listJobs() { return []; },
  async listPublicationAttempts() { return []; },
  async listWebhookEvents() { return []; },
  async healthCheck() { return { ok:true, backend:'json' }; }
};

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host:'127.0.0.1', port:0 }, resolve);
  });
  const address = server.address();
  return {
    url:`http://127.0.0.1:${address.port}`,
    close:()=>new Promise((resolve) => server.close(resolve))
  };
}

test('createRequestHandler keeps Operations runtime dependencies instance-local', async () => {
  const first = await listen(createRequestHandler({
    repository,
    operationsRuntime:{
      mediaStore:{ async healthCheck() { return { ok:true, backend:'local', writable:true, errorCode:null }; } },
      schedulerLoop:{ status() { return { configured:false, running:false, stopped:true, inFlight:false, intervalMs:null, lastTickStartedAt:null, lastSuccessfulTickAt:null, lastFailedTickAt:null, lastErrorCode:null }; } },
      environment:{ DATABASE_DRIVER:'json', MEDIA_STORAGE_DRIVER:'local' }
    }
  }));
  const second = await listen(createRequestHandler({
    repository,
    operationsRuntime:{
      mediaStore:{ async healthCheck() { return { ok:false, backend:'s3', writable:false, errorCode:'MEDIA_STORAGE_UNAVAILABLE' }; } },
      schedulerLoop:{ status() { return { configured:true, running:true, stopped:false, inFlight:true, intervalMs:1234, lastTickStartedAt:null, lastSuccessfulTickAt:null, lastFailedTickAt:null, lastErrorCode:null }; } },
      environment:{ DATABASE_DRIVER:'json', MEDIA_STORAGE_DRIVER:'s3' }
    }
  }));

  try {
    const firstPayload = await fetch(`${first.url}/api/operations`).then((response) => response.json());
    const secondPayload = await fetch(`${second.url}/api/operations`).then((response) => response.json());
    assert.equal(firstPayload.runtime.storage.backend, 'local');
    assert.equal(firstPayload.runtime.scheduler.configured, false);
    assert.equal(secondPayload.runtime.storage.backend, 's3');
    assert.equal(secondPayload.runtime.scheduler.configured, true);
    assert.notDeepEqual(firstPayload.runtime, secondPayload.runtime);
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
