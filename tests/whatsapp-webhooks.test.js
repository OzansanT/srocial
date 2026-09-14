import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleWhatsAppChallenge, handleWhatsAppWebhook } from '../server/routes/webhooks.js';

function repositoryFixture({ messageState = 'SENT' } = {}) {
  const events = [];
  const recipient = { id: 'recipient-1', state: messageState };
  const message = {
    id: 'message-1', campaignRecipientId: recipient.id, providerMessageId: 'wamid.123',
    state: messageState, errorCode: null
  };
  return {
    events, message, recipient,
    async getWebhookEventByExternalId(provider, externalEventId) { return events.find((x) => x.provider === provider && x.externalEventId === externalEventId) ?? null; },
    async createWebhookEvent(record) { const item = { id: `event-${events.length + 1}`, ...structuredClone(record) }; events.push(item); return item; },
    async updateWebhookEvent(id, patch) { const item = events.find((x) => x.id === id); Object.assign(item, structuredClone(patch)); return structuredClone(item); },
    async findWhatsAppMessageByProviderId(id) { return id === message.providerMessageId ? structuredClone(message) : null; },
    async updateWhatsAppMessage(id, patch) { if (id !== message.id) return null; Object.assign(message, structuredClone(patch)); return structuredClone(message); },
    async updateCampaignRecipient(id, patch) { if (id !== recipient.id) return null; Object.assign(recipient, structuredClone(patch)); return structuredClone(recipient); },
    async upsertProviderStatus() { return null; }
  };
}

function signed(raw, secret) {
  return `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
}

function statusPayload(status, extra = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.123', status, timestamp: '1789390800', ...extra }] } }] }]
  };
}

test('WhatsApp verification challenge requires matching token', () => {
  assert.deepEqual(handleWhatsAppChallenge({ mode: 'subscribe', verifyToken: 'v', challenge: 'abc', expectedToken: 'v' }), { statusCode: 200, text: 'abc' });
  assert.equal(handleWhatsAppChallenge({ mode: 'subscribe', verifyToken: 'bad', challenge: 'abc', expectedToken: 'v' }).statusCode, 403);
});

test('WhatsApp webhook rejects invalid signature and applies delivered/read transitions', async () => {
  const repository = repositoryFixture();
  const secret = 'app-secret';
  const deliveredPayload = statusPayload('delivered');
  const deliveredRaw = Buffer.from(JSON.stringify(deliveredPayload));
  assert.equal((await handleWhatsAppWebhook({ repository, rawBody: deliveredRaw, signature: 'sha256=bad', appSecret: secret })).statusCode, 401);

  const delivered = await handleWhatsAppWebhook({ repository, rawBody: deliveredRaw, signature: signed(deliveredRaw, secret), appSecret: secret, now: new Date('2026-09-14T13:00:00.000Z') });
  assert.equal(delivered.statusCode, 200);
  assert.equal(repository.message.state, 'DELIVERED');
  assert.equal(repository.recipient.state, 'DELIVERED');

  const readPayload = statusPayload('read');
  const readRaw = Buffer.from(JSON.stringify(readPayload));
  await handleWhatsAppWebhook({ repository, rawBody: readRaw, signature: signed(readRaw, secret), appSecret: secret, now: new Date('2026-09-14T13:01:00.000Z') });
  assert.equal(repository.message.state, 'READ');
  assert.equal(repository.recipient.state, 'READ');
});

test('WhatsApp webhook does not downgrade READ state on a later delivered event', async () => {
  const repository = repositoryFixture({ messageState: 'READ' });
  const raw = Buffer.from(JSON.stringify(statusPayload('delivered')));
  await handleWhatsAppWebhook({ repository, rawBody: raw, signature: signed(raw, 'secret'), appSecret: 'secret', now: new Date('2026-09-14T13:00:00.000Z') });
  assert.equal(repository.message.state, 'READ');
  assert.equal(repository.recipient.state, 'READ');
});

test('WhatsApp failed status records sanitized failure state', async () => {
  const repository = repositoryFixture();
  const raw = Buffer.from(JSON.stringify(statusPayload('failed', { errors: [{ code: 131026, title: 'raw sensitive provider detail' }] })));
  await handleWhatsAppWebhook({ repository, rawBody: raw, signature: signed(raw, 'secret'), appSecret: 'secret', now: new Date('2026-09-14T13:00:00.000Z') });
  assert.equal(repository.message.state, 'FAILED');
  assert.equal(repository.message.errorCode, 'PROVIDER_ERROR');
  assert.equal(repository.recipient.state, 'FAILED');
});

test('duplicate processed WhatsApp delivery is acknowledged without repeating side effects', async () => {
  const repository = repositoryFixture();
  let updates = 0;
  const original = repository.updateWhatsAppMessage;
  repository.updateWhatsAppMessage = async (...args) => { updates += 1; return original(...args); };
  const raw = Buffer.from(JSON.stringify(statusPayload('delivered')));
  const signature = signed(raw, 'secret');
  const first = await handleWhatsAppWebhook({ repository, rawBody: raw, signature, appSecret: 'secret', now: new Date('2026-09-14T13:00:00.000Z') });
  const second = await handleWhatsAppWebhook({ repository, rawBody: raw, signature, appSecret: 'secret', now: new Date('2026-09-14T13:00:05.000Z') });
  assert.equal(first.payload.duplicate, false);
  assert.equal(second.payload.duplicate, true);
  assert.equal(repository.events.length, 1);
  assert.equal(updates, 1);
});

test('incomplete persisted WhatsApp webhook resumes on provider retry', async () => {
  const repository = repositoryFixture();
  const raw = Buffer.from(JSON.stringify(statusPayload('delivered')));
  const signature = signed(raw, 'secret');
  repository.events.push({
    id: 'event-1', provider: 'whatsapp', externalEventId: `sha256:${await import('node:crypto').then(({ createHash }) => createHash('sha256').update(raw).digest('hex'))}`,
    eventType: 'whatsapp.status', payload: statusPayload('delivered'), signatureValid: true,
    processingState: 'RECEIVED', errorCode: null, receivedAt: '2026-09-14T12:59:00.000Z', processedAt: null
  });
  const result = await handleWhatsAppWebhook({ repository, rawBody: raw, signature, appSecret: 'secret', now: new Date('2026-09-14T13:00:00.000Z') });
  assert.equal(result.payload.duplicate, false);
  assert.equal(repository.events.length, 1);
  assert.equal(repository.events[0].processingState, 'PROCESSED');
  assert.equal(repository.message.state, 'DELIVERED');
});
