import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { verifyMetaSignature, verifyTikTokSignature } from '../server/webhooks/signatures.js';
import { handleMetaChallenge, handleMetaWebhook, handleTikTokWebhook } from '../server/routes/webhooks.js';

function repositoryFixture() {
  const events = [];
  const publications = [{ id:'pub-1', platform:'tiktok', externalId:'publish-123', state:'PROCESSING' }];
  const accounts = [{ id:'acc-1', provider:'tiktok', providerAccountId:'open-1', state:'CONNECTED' }];
  return {
    events, publications, accounts,
    async getWebhookEventByExternalId(provider, externalEventId) {
      return events.find((item) => item.provider === provider && item.externalEventId === externalEventId) ?? null;
    },
    async createWebhookEvent(record) { const item={ id:`evt-${events.length+1}`, ...structuredClone(record) }; events.push(item); return item; },
    async updateWebhookEvent(id, patch) { const item=events.find((candidate)=>candidate.id===id); Object.assign(item, structuredClone(patch)); return structuredClone(item); },
    async findPublicationByExternalId(platform, externalId) { return publications.find((item)=>item.platform===platform && item.externalId===externalId) ?? null; },
    async updatePublication(id, patch) { const item=publications.find((candidate)=>candidate.id===id); Object.assign(item, structuredClone(patch)); return structuredClone(item); },
    async findAccountByProviderIdentity(provider, providerAccountId) { return accounts.find((item)=>item.provider===provider && item.providerAccountId===providerAccountId) ?? null; },
    async updateAccount(id, patch) { const item=accounts.find((candidate)=>candidate.id===id); Object.assign(item, structuredClone(patch)); return structuredClone(item); },
    async upsertProviderStatus() { return null; }
  };
}

test('Meta verification challenge requires matching configured token', () => {
  assert.deepEqual(handleMetaChallenge({ mode:'subscribe', verifyToken:'secret', challenge:'abc123', expectedToken:'secret' }), { statusCode:200, text:'abc123' });
  assert.equal(handleMetaChallenge({ mode:'subscribe', verifyToken:'bad', challenge:'abc123', expectedToken:'secret' }).statusCode, 403);
});

test('Meta webhook HMAC verifies raw bytes and rejects tampering', () => {
  const raw=Buffer.from('{"object":"instagram","entry":[]}');
  const secret='meta-secret';
  const signature=`sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  assert.equal(verifyMetaSignature({ rawBody:raw, signature, secret }), true);
  assert.equal(verifyMetaSignature({ rawBody:Buffer.from('{}'), signature, secret }), false);
});

test('TikTok webhook HMAC enforces timestamp freshness', () => {
  const raw=Buffer.from('{"event":"post.publish.complete"}');
  const secret='tt-secret';
  const timestamp='1789387200';
  const signature=createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
  const header=`t=${timestamp},s=${signature}`;
  assert.equal(verifyTikTokSignature({ rawBody:raw, signature:header, secret, now:new Date('2026-09-14T12:00:00.000Z') }), true);
  assert.equal(verifyTikTokSignature({ rawBody:raw, signature:header, secret, now:new Date('2026-09-14T12:10:01.000Z') }), false);
});

test('duplicate TikTok delivery is acknowledged once without repeating publication side effects', async () => {
  const repository=repositoryFixture();
  const payload={ client_key:'client', event:'post.publish.complete', create_time:1789387200, user_openid:'open-1', content:JSON.stringify({ publish_id:'publish-123', publish_type:'DIRECT_POST' }) };
  const raw=Buffer.from(JSON.stringify(payload));
  const secret='tt-secret';
  const timestamp='1789387200';
  const signature=createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
  const header=`t=${timestamp},s=${signature}`;
  const first=await handleTikTokWebhook({ repository, rawBody:raw, signature:header, clientSecret:secret, now:new Date('2026-09-14T12:00:00.000Z') });
  const second=await handleTikTokWebhook({ repository, rawBody:raw, signature:header, clientSecret:secret, now:new Date('2026-09-14T12:00:10.000Z') });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(repository.events.length, 1);
  assert.equal(repository.publications[0].state, 'PUBLISHED');
});

test('provider retry resumes an incomplete persisted TikTok webhook instead of dropping the side effect', async () => {
  const repository=repositoryFixture();
  const payload={ client_key:'client', event:'post.publish.complete', create_time:1789387200, user_openid:'open-1', content:JSON.stringify({ publish_id:'publish-123', publish_type:'DIRECT_POST' }) };
  const raw=Buffer.from(JSON.stringify(payload));
  const fingerprint=`sha256:${createHash('sha256').update(raw).digest('hex')}`;
  repository.events.push({
    id:'evt-existing', provider:'tiktok', externalEventId:fingerprint,
    eventType:'post.publish.complete', payload, signatureValid:true,
    processingState:'RECEIVED', errorCode:null,
    receivedAt:'2026-09-14T11:59:55.000Z', processedAt:null
  });
  const secret='tt-secret';
  const timestamp='1789387200';
  const signature=createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
  const result=await handleTikTokWebhook({
    repository, rawBody:raw, signature:`t=${timestamp},s=${signature}`,
    clientSecret:secret, now:new Date('2026-09-14T12:00:00.000Z')
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.duplicate, false);
  assert.equal(repository.events.length, 1);
  assert.equal(repository.events[0].processingState, 'PROCESSED');
  assert.equal(repository.publications[0].state, 'PUBLISHED');
});

test('TikTok publish failure synchronizes publication error state and authorization removal disconnects account', async () => {
  const repository=repositoryFixture();
  const secret='tt-secret';
  async function send(payload, iso) {
    const raw=Buffer.from(JSON.stringify(payload));
    const timestamp=String(payload.create_time);
    const signature=createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
    return handleTikTokWebhook({ repository, rawBody:raw, signature:`t=${timestamp},s=${signature}`, clientSecret:secret, now:new Date(iso) });
  }
  await send({ client_key:'client', event:'post.publish.failed', create_time:1789387200, user_openid:'open-1', content:JSON.stringify({ publish_id:'publish-123', fail_reason:'file_format_check_failed' }) }, '2026-09-14T12:00:00.000Z');
  assert.equal(repository.publications[0].state, 'FAILED');
  assert.equal(repository.publications[0].errorCode, 'MEDIA_ERROR');
  await send({ client_key:'client', event:'authorization.removed', create_time:1789387210, user_openid:'open-1', content:JSON.stringify({ reason:1 }) }, '2026-09-14T12:00:10.000Z');
  assert.equal(repository.accounts[0].state, 'DISCONNECTED');
  assert.equal(repository.accounts[0].lastErrorCode, 'PERMISSION_REVOKED');
});

test('Meta verified deliveries are persisted and deduplicated', async () => {
  const repository=repositoryFixture();
  const payload={ object:'instagram', entry:[{ id:'ig-1', time:1789387200, changes:[{ field:'comments', value:{ id:'comment-1' } }] }] };
  const raw=Buffer.from(JSON.stringify(payload));
  const secret='meta-secret';
  const signature=`sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  const first=await handleMetaWebhook({ repository, rawBody:raw, signature, appSecret:secret, now:new Date('2026-09-14T12:00:00.000Z') });
  const second=await handleMetaWebhook({ repository, rawBody:raw, signature, appSecret:secret, now:new Date('2026-09-14T12:00:05.000Z') });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(repository.events.length, 1);
  assert.equal(repository.events[0].eventType, 'meta.instagram');
});
