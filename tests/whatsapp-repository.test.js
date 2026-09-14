import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonRepository } from '../server/db/json-repository.js';

async function withRepository(run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-whatsapp-'));
  try {
    const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
    await repository.initialize();
    await run(repository);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('JSON repository persists WhatsApp contacts, templates, campaigns, recipients, and messages', async () => {
  await withRepository(async (repository) => {
    const contact = await repository.createContact({
      phoneNumber: '+905551112233',
      displayName: 'Ada',
      consentStatus: 'OPTED_IN',
      consentSource: 'web-form',
      consentAt: '2026-09-14T12:00:00.000Z',
      createdAt: '2026-09-14T12:00:00.000Z',
      updatedAt: '2026-09-14T12:00:00.000Z'
    });
    assert.equal((await repository.getContact(contact.id)).phoneNumber, '+905551112233');
    assert.equal((await repository.listContacts()).length, 1);

    const template = await repository.upsertWhatsAppTemplate({
      providerTemplateId: 'provider-template-1',
      name: 'order_update',
      language: 'en_US',
      category: 'UTILITY',
      status: 'APPROVED',
      createdAt: '2026-09-14T12:00:00.000Z',
      updatedAt: '2026-09-14T12:00:00.000Z'
    });
    assert.equal((await repository.getWhatsAppTemplate(template.id)).status, 'APPROVED');
    assert.equal((await repository.listWhatsAppTemplates()).length, 1);

    const campaign = await repository.createCampaign({
      templateId: template.id,
      name: 'Order updates',
      state: 'SCHEDULED',
      scheduledAt: '2026-09-14T13:00:00.000Z',
      templateComponents: [{ type: 'body', parameters: [{ type: 'text', text: '123' }] }],
      createdAt: '2026-09-14T12:00:00.000Z',
      updatedAt: '2026-09-14T12:00:00.000Z'
    });
    assert.equal((await repository.getCampaign(campaign.id)).templateComponents.length, 1);

    const recipient = await repository.createCampaignRecipient({
      campaignId: campaign.id,
      contactId: contact.id,
      state: 'QUEUED',
      createdAt: '2026-09-14T12:00:00.000Z'
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
  });
});

test('JSON repository updates consent and recipient/message state without replacing ids', async () => {
  await withRepository(async (repository) => {
    const contact = await repository.createContact({ phoneNumber: '+905551112233', consentStatus: 'UNKNOWN' });
    const updated = await repository.updateContact(contact.id, { consentStatus: 'OPTED_OUT' });
    assert.equal(updated.id, contact.id);
    assert.equal(updated.consentStatus, 'OPTED_OUT');

    const campaign = await repository.createCampaign({ name: 'Test', state: 'SCHEDULED', scheduledAt: '2026-09-14T13:00:00.000Z', templateComponents: [] });
    const recipient = await repository.createCampaignRecipient({ campaignId: campaign.id, contactId: contact.id, state: 'QUEUED' });
    assert.equal((await repository.updateCampaignRecipient(recipient.id, { state: 'FAILED' })).id, recipient.id);

    const message = await repository.createWhatsAppMessage({ campaignId: campaign.id, campaignRecipientId: recipient.id, contactId: contact.id, state: 'SENDING' });
    const failed = await repository.updateWhatsAppMessage(message.id, { state: 'FAILED', errorCode: 'DELIVERY_UNCERTAIN' });
    assert.equal(failed.id, message.id);
    assert.equal(failed.errorCode, 'DELIVERY_UNCERTAIN');
  });
});
