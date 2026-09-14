import test from 'node:test';
import assert from 'node:assert/strict';
import { getWhatsAppConfig } from '../server/messaging/whatsapp/config.js';
import { createWhatsAppAdapter } from '../server/messaging/whatsapp/adapter.js';
import { syncWhatsAppTemplates } from '../server/services/whatsapp-template-service.js';

test('WhatsApp config fails closed until all server credentials are present', () => {
  assert.equal(getWhatsAppConfig({}), null);
  assert.equal(getWhatsAppConfig({ WHATSAPP_ACCESS_TOKEN: 'token' }), null);

  const config = getWhatsAppConfig({
    WHATSAPP_ACCESS_TOKEN: 'token',
    WHATSAPP_PHONE_NUMBER_ID: 'phone-1',
    WHATSAPP_BUSINESS_ACCOUNT_ID: 'waba-1',
    WHATSAPP_VERIFY_TOKEN: 'verify',
    WHATSAPP_APP_SECRET: 'secret'
  });
  assert.equal(config.graphApiVersion, 'v26.0');
  assert.equal(config.allowRealWhatsApp, false);
  assert.equal(config.phoneNumberId, 'phone-1');
});

test('WhatsApp config normalizes explicit Graph version and send gate', () => {
  const config = getWhatsAppConfig({
    WHATSAPP_ACCESS_TOKEN: 'token',
    WHATSAPP_PHONE_NUMBER_ID: 'phone-1',
    WHATSAPP_BUSINESS_ACCOUNT_ID: 'waba-1',
    WHATSAPP_VERIFY_TOKEN: 'verify',
    WHATSAPP_APP_SECRET: 'secret',
    WHATSAPP_GRAPH_API_VERSION: '26.0',
    ALLOW_REAL_WHATSAPP: 'true'
  });
  assert.equal(config.graphApiVersion, 'v26.0');
  assert.equal(config.allowRealWhatsApp, true);
});

test('WhatsApp adapter normalizes template discovery and sends approved template payloads', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/message_templates')) {
      return new Response(JSON.stringify({
        data: [{ id: 'tpl-1', name: 'order_update', language: 'en_US', category: 'UTILITY', status: 'APPROVED' }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.123' }] }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  };
  const adapter = createWhatsAppAdapter({
    config: {
      accessToken: 'server-secret', phoneNumberId: 'phone-1', businessAccountId: 'waba-1',
      verifyToken: 'verify', appSecret: 'secret', graphApiVersion: 'v26.0', allowRealWhatsApp: true
    },
    fetchImpl
  });

  const templates = await adapter.getTemplates();
  assert.deepEqual(templates, [{
    providerTemplateId: 'tpl-1', name: 'order_update', language: 'en_US', category: 'UTILITY', status: 'APPROVED'
  }]);

  const result = await adapter.sendTemplate({
    to: '+905551112233', template: templates[0], components: [{ type: 'body', parameters: [{ type: 'text', text: '123' }] }]
  });
  assert.equal(result.providerMessageId, 'wamid.123');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.authorization, 'Bearer server-secret');
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.messaging_product, 'whatsapp');
  assert.equal(body.to, '+905551112233');
  assert.equal(body.template.name, 'order_update');
  assert.equal(body.template.language.code, 'en_US');
});

test('WhatsApp adapter maps provider rate limits and transport failures to safe errors', async () => {
  const rateLimited = createWhatsAppAdapter({
    config: {
      accessToken: 'token', phoneNumberId: 'phone', businessAccountId: 'waba', verifyToken: 'v',
      appSecret: 's', graphApiVersion: 'v26.0', allowRealWhatsApp: true
    },
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: 4, message: 'sensitive provider text' } }), { status: 429 })
  });
  await assert.rejects(() => rateLimited.getTemplates(), (error) => {
    assert.equal(error.code, 'RATE_LIMIT');
    assert.equal(error.retryable, true);
    assert.doesNotMatch(String(error.message), /sensitive provider text/);
    return true;
  });

  const network = createWhatsAppAdapter({
    config: {
      accessToken: 'token', phoneNumberId: 'phone', businessAccountId: 'waba', verifyToken: 'v',
      appSecret: 's', graphApiVersion: 'v26.0', allowRealWhatsApp: true
    },
    fetchImpl: async () => { throw new Error('socket secret'); }
  });
  await assert.rejects(() => network.getTemplates(), (error) => error.code === 'NETWORK_ERROR' && error.retryable === true);
});

test('template synchronization upserts normalized provider templates with timestamps', async () => {
  const upserts = [];
  const repository = {
    async upsertWhatsAppTemplate(record) { upserts.push(record); return { id: `local-${upserts.length}`, ...record }; }
  };
  const adapter = {
    async getTemplates() {
      return [
        { providerTemplateId: 'one', name: 'approved', language: 'en_US', category: 'UTILITY', status: 'APPROVED' },
        { providerTemplateId: 'two', name: 'pending', language: 'tr_TR', category: 'MARKETING', status: 'PENDING' }
      ];
    }
  };
  const result = await syncWhatsAppTemplates({ repository, adapter, now: new Date('2026-09-14T12:00:00.000Z') });
  assert.equal(result.length, 2);
  assert.equal(upserts[0].updatedAt, '2026-09-14T12:00:00.000Z');
  assert.equal(upserts[1].status, 'PENDING');
});
