import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsAppContact, setWhatsAppConsent } from '../server/services/whatsapp-contact-service.js';
import { createWhatsAppCampaign } from '../server/services/whatsapp-campaign-service.js';
import {
  createWhatsAppContactPayload,
  createWhatsAppCampaignPayload,
  listWhatsAppContactsPayload,
  listWhatsAppTemplatesPayload,
  syncWhatsAppTemplatesPayload
} from '../server/routes/whatsapp.js';

function repositoryFixture() {
  const contacts = [];
  const templates = [{ id: 'tpl-1', name: 'order_update', language: 'en_US', status: 'APPROVED', accountId: null }];
  const campaigns = [];
  const recipients = [];
  const jobs = [];
  return {
    contacts, templates, campaigns, recipients, jobs,
    async createContact(record) { const item = { id: `contact-${contacts.length + 1}`, ...record }; contacts.push(item); return item; },
    async updateContact(id, patch) { const item = contacts.find((x) => x.id === id); if (!item) return null; Object.assign(item, patch); return structuredClone(item); },
    async getContact(id) { return structuredClone(contacts.find((x) => x.id === id) ?? null); },
    async listContacts() { return structuredClone(contacts); },
    async getWhatsAppTemplate(id) { return structuredClone(templates.find((x) => x.id === id) ?? null); },
    async listWhatsAppTemplates() { return structuredClone(templates); },
    async upsertWhatsAppTemplate(record) { const item = { id: `tpl-${templates.length + 1}`, ...record }; templates.push(item); return item; },
    async createCampaign(record) { const item = { id: `campaign-${campaigns.length + 1}`, ...record }; campaigns.push(item); return item; },
    async createCampaignRecipient(record) { const item = { id: `recipient-${recipients.length + 1}`, ...record }; recipients.push(item); return item; },
    async createJob(record) { const item = { id: `job-${jobs.length + 1}`, ...record }; jobs.push(item); return item; }
  };
}

test('contact creation validates E.164 and persists explicit consent metadata', async () => {
  const repository = repositoryFixture();
  await assert.rejects(() => createWhatsAppContact({ repository, input: { phoneNumber: '0555' } }), (error) => error.code === 'VALIDATION_ERROR');
  const contact = await createWhatsAppContact({
    repository,
    input: { phoneNumber: '+905551112233', displayName: 'Ada', consentStatus: 'OPTED_IN', consentSource: 'checkout' },
    now: new Date('2026-09-14T12:00:00.000Z')
  });
  assert.equal(contact.consentStatus, 'OPTED_IN');
  assert.equal(contact.consentSource, 'checkout');
  assert.equal(contact.consentAt, '2026-09-14T12:00:00.000Z');
});

test('consent updates require known explicit state', async () => {
  const repository = repositoryFixture();
  const contact = await repository.createContact({ phoneNumber: '+905551112233', consentStatus: 'UNKNOWN' });
  await assert.rejects(() => setWhatsAppConsent({ repository, contactId: contact.id, input: { consentStatus: 'MAYBE' } }), (error) => error.code === 'VALIDATION_ERROR');
  const updated = await setWhatsAppConsent({
    repository,
    contactId: contact.id,
    input: { consentStatus: 'OPTED_OUT', consentSource: 'user-request' },
    now: new Date('2026-09-14T12:05:00.000Z')
  });
  assert.equal(updated.consentStatus, 'OPTED_OUT');
});

test('campaign creation requires future schedule, approved template, unique opted-in recipients and creates one scheduler job', async () => {
  const repository = repositoryFixture();
  const one = await repository.createContact({ id: 'ignored', phoneNumber: '+905551112233', consentStatus: 'OPTED_IN' });
  const two = await repository.createContact({ phoneNumber: '+905551112244', consentStatus: 'OPTED_IN' });
  await assert.rejects(() => createWhatsAppCampaign({
    repository,
    input: { name: 'Past', templateId: 'tpl-1', contactIds: [one.id], scheduledAt: '2026-09-14T11:00:00.000Z' },
    now: new Date('2026-09-14T12:00:00.000Z')
  }), (error) => error.code === 'VALIDATION_ERROR');

  const result = await createWhatsAppCampaign({
    repository,
    input: {
      name: 'Order updates', templateId: 'tpl-1', contactIds: [one.id, one.id, two.id],
      scheduledAt: '2026-09-14T13:00:00.000Z',
      templateComponents: [{ type: 'body', parameters: [{ type: 'text', text: '123' }] }]
    },
    now: new Date('2026-09-14T12:00:00.000Z')
  });
  assert.equal(result.recipients.length, 2);
  assert.equal(repository.jobs.length, 1);
  assert.equal(repository.jobs[0].type, 'WHATSAPP_CAMPAIGN');
  assert.equal(repository.jobs[0].campaignId, result.campaign.id);
});

test('campaign creation rejects opted-out recipients and unapproved templates before writes', async () => {
  const repository = repositoryFixture();
  const contact = await repository.createContact({ phoneNumber: '+905551112233', consentStatus: 'OPTED_OUT' });
  await assert.rejects(() => createWhatsAppCampaign({
    repository,
    input: { name: 'No', templateId: 'tpl-1', contactIds: [contact.id], scheduledAt: '2026-09-14T13:00:00.000Z' },
    now: new Date('2026-09-14T12:00:00.000Z')
  }), (error) => error.code === 'VALIDATION_ERROR');
  assert.equal(repository.campaigns.length, 0);
  repository.templates[0].status = 'PENDING';
  repository.contacts[0].consentStatus = 'OPTED_IN';
  await assert.rejects(() => createWhatsAppCampaign({
    repository,
    input: { name: 'No', templateId: 'tpl-1', contactIds: [contact.id], scheduledAt: '2026-09-14T13:00:00.000Z' },
    now: new Date('2026-09-14T12:00:00.000Z')
  }), (error) => error.code === 'VALIDATION_ERROR');
  assert.equal(repository.campaigns.length, 0);
});

test('WhatsApp route payloads expose safe contact/template data and sync through server adapter', async () => {
  const repository = repositoryFixture();
  const created = await createWhatsAppContactPayload(repository, { phoneNumber: '+905551112233' }, { now: new Date('2026-09-14T12:00:00.000Z') });
  assert.equal(created.statusCode, 201);
  assert.equal((await listWhatsAppContactsPayload(repository)).payload.contacts.length, 1);
  assert.equal((await listWhatsAppTemplatesPayload(repository)).payload.templates[0].name, 'order_update');

  const adapter = { async getTemplates() { return [{ providerTemplateId: 'provider-2', name: 'new_template', language: 'en_US', category: 'UTILITY', status: 'APPROVED' }]; } };
  const synced = await syncWhatsAppTemplatesPayload(repository, adapter, { now: new Date('2026-09-14T12:00:00.000Z') });
  assert.equal(synced.statusCode, 200);
  assert.equal(synced.payload.templates.length, 1);

  const campaign = await createWhatsAppCampaignPayload(repository, {
    name: 'Order updates', templateId: 'tpl-1', contactIds: [repository.contacts[0].id], scheduledAt: '2026-09-14T13:00:00.000Z'
  }, { now: new Date('2026-09-14T12:00:00.000Z') });
  assert.equal(campaign.statusCode, 201);
});
