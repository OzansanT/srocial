import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresRepository } from '../server/db/postgres-repository.js';
import {
  dropPostgresTestSchema,
  hasPostgresTestDatabase,
  preparePostgresTestSchema
} from './helpers/postgres-test-db.js';

const enabled = hasPostgresTestDatabase();
const schema = 'test_whatsapp_repository_v17';
let pool;
let repository;

before(async () => {
  if (!enabled) return;
  pool = await preparePostgresTestSchema(schema);
  repository = createPostgresRepository({ pool });
});

beforeEach(async () => {
  if (!enabled) return;
  await pool.query('TRUNCATE TABLE whatsapp_messages, campaign_recipients, campaigns, whatsapp_templates, contacts RESTART IDENTITY CASCADE');
});

after(async () => {
  if (!enabled) return;
  await pool.end();
  await dropPostgresTestSchema(schema);
});

test('PostgreSQL repository exposes V17 WhatsApp runtime tables', { skip: !enabled }, async () => {
  await repository.initialize();
});

test('PostgreSQL repository round-trips WhatsApp runtime records in JSON-compatible shapes', { skip: !enabled }, async () => {
  const createdAt = '2026-09-14T12:00:00.000Z';
  const contact = await repository.createContact({
    phoneNumber: '+905551112233',
    displayName: 'Ada',
    consentStatus: 'OPTED_IN',
    consentSource: 'web-form',
    consentAt: createdAt,
    createdAt,
    updatedAt: createdAt
  });
  assert.equal((await repository.getContact(contact.id)).phoneNumber, '+905551112233');

  const template = await repository.upsertWhatsAppTemplate({
    providerTemplateId: 'provider-template-1',
    name: 'order_update',
    language: 'en_US',
    category: 'UTILITY',
    status: 'APPROVED',
    createdAt,
    updatedAt: createdAt
  });
  assert.equal((await repository.getWhatsAppTemplate(template.id)).status, 'APPROVED');

  const campaign = await repository.createCampaign({
    templateId: template.id,
    name: 'Order updates',
    state: 'SCHEDULED',
    scheduledAt: '2026-09-14T13:00:00.000Z',
    templateComponents: [{ type: 'body', parameters: [{ type: 'text', text: '123' }] }],
    createdAt,
    updatedAt: createdAt
  });
  assert.equal((await repository.getCampaign(campaign.id)).templateComponents.length, 1);

  const recipient = await repository.createCampaignRecipient({
    campaignId: campaign.id,
    contactId: contact.id,
    state: 'QUEUED',
    createdAt
  });
  assert.equal((await repository.listCampaignRecipients(campaign.id)).length, 1);

  const message = await repository.createWhatsAppMessage({
    campaignId: campaign.id,
    campaignRecipientId: recipient.id,
    contactId: contact.id,
    providerMessageId: 'wamid.123',
    state: 'SENT',
    sentAt: '2026-09-14T13:00:01.000Z',
    createdAt: '2026-09-14T13:00:00.000Z',
    updatedAt: '2026-09-14T13:00:01.000Z'
  });
  assert.equal((await repository.findWhatsAppMessageByProviderId('wamid.123')).id, message.id);
  assert.equal((await repository.findLatestWhatsAppMessageForRecipient(recipient.id)).state, 'SENT');
  assert.equal((await repository.listWhatsAppMessages({ campaignId: campaign.id })).length, 1);

  const status = await repository.upsertProviderStatus('whatsapp', {
    healthState: 'HEALTHY',
    lastSuccessAt: createdAt,
    updatedAt: createdAt
  });
  assert.equal(status.provider, 'whatsapp');
});
