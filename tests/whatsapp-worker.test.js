import test from 'node:test';
import assert from 'node:assert/strict';
import { executeWhatsAppCampaignJob } from '../server/scheduler/workers/whatsapp-campaign-worker.js';
import { startSchedulerLoop } from '../server/scheduler/start-scheduler-loop.js';

function repositoryFixture({ recipientState = 'QUEUED', existingMessage = null } = {}) {
  const campaign = { id: 'campaign-1', templateId: 'tpl-1', templateComponents: [], state: 'SCHEDULED' };
  const template = { id: 'tpl-1', name: 'order_update', language: 'en_US', status: 'APPROVED' };
  const contact = { id: 'contact-1', phoneNumber: '+905551112233', consentStatus: 'OPTED_IN' };
  const recipient = { id: 'recipient-1', campaignId: campaign.id, contactId: contact.id, state: recipientState };
  const messages = existingMessage ? [{ id: 'message-existing', campaignId: campaign.id, campaignRecipientId: recipient.id, contactId: contact.id, ...existingMessage }] : [];
  const jobs = [{ id: 'job-1', type: 'WHATSAPP_CAMPAIGN', campaignId: campaign.id, state: 'RUNNING', attempts: 1 }];
  return {
    campaign, template, contact, recipient, messages, jobs,
    async getCampaign(id) { return id === campaign.id ? structuredClone(campaign) : null; },
    async getWhatsAppTemplate(id) { return id === template.id ? structuredClone(template) : null; },
    async listCampaignRecipients() { return [structuredClone(recipient)]; },
    async getContact(id) { return id === contact.id ? structuredClone(contact) : null; },
    async findLatestWhatsAppMessageForRecipient() { return messages.length ? structuredClone(messages.at(-1)) : null; },
    async createWhatsAppMessage(record) { const item = { id: `message-${messages.length + 1}`, ...structuredClone(record) }; messages.push(item); return structuredClone(item); },
    async updateWhatsAppMessage(id, patch) { const item = messages.find((x) => x.id === id); Object.assign(item, structuredClone(patch)); return structuredClone(item); },
    async updateCampaignRecipient(id, patch) { if (id !== recipient.id) return null; Object.assign(recipient, structuredClone(patch)); return structuredClone(recipient); },
    async updateCampaign(id, patch) { if (id !== campaign.id) return null; Object.assign(campaign, structuredClone(patch)); return structuredClone(campaign); },
    async updateJob(id, patch) { const item = jobs.find((x) => x.id === id); Object.assign(item, structuredClone(patch)); return structuredClone(item); },
    async upsertProviderStatus() { return null; }
  };
}

test('WhatsApp campaign worker sends one eligible recipient and records provider message id', async () => {
  const repository = repositoryFixture();
  const calls = [];
  const result = await executeWhatsAppCampaignJob({
    job: repository.jobs[0], repository,
    messagingRegistry: new Map([['whatsapp', { async sendTemplate(input) { calls.push(input); return { providerMessageId: 'wamid.123' }; } }]]),
    now: new Date('2026-09-14T13:00:00.000Z')
  });
  assert.equal(result.status, 'COMPLETED');
  assert.equal(calls.length, 1);
  assert.equal(repository.messages[0].state, 'SENT');
  assert.equal(repository.messages[0].providerMessageId, 'wamid.123');
  assert.equal(repository.recipient.state, 'SENT');
  assert.equal(repository.campaign.state, 'COMPLETED');
});

test('explicit provider rate limit retries recipient and same campaign job', async () => {
  const repository = repositoryFixture();
  const error = Object.assign(new Error('safe'), { code: 'RATE_LIMIT', retryable: true });
  const result = await executeWhatsAppCampaignJob({
    job: repository.jobs[0], repository,
    messagingRegistry: new Map([['whatsapp', { async sendTemplate() { throw error; } }]]),
    now: new Date('2026-09-14T13:00:00.000Z'),
    retryPolicy: { classifyExecutionError: () => ({ code: 'RATE_LIMIT', retryable: true }), getRetryDelayMs: () => 60000 }
  });
  assert.equal(result.status, 'RETRYING');
  assert.equal(repository.recipient.state, 'RETRYING');
  assert.equal(repository.jobs[0].state, 'RETRYING');
  assert.equal(repository.jobs[0].scheduledAt, '2026-09-14T13:01:00.000Z');
});

test('network ambiguity fails closed instead of blindly resending recipient', async () => {
  const repository = repositoryFixture();
  const error = Object.assign(new Error('socket'), { code: 'NETWORK_ERROR', retryable: true });
  const result = await executeWhatsAppCampaignJob({
    job: repository.jobs[0], repository,
    messagingRegistry: new Map([['whatsapp', { async sendTemplate() { throw error; } }]]),
    now: new Date('2026-09-14T13:00:00.000Z')
  });
  assert.equal(result.status, 'COMPLETED');
  assert.equal(repository.recipient.state, 'FAILED');
  assert.equal(repository.messages[0].errorCode, 'DELIVERY_UNCERTAIN');
});

test('persisted unresolved SENDING message is terminalized without another provider call', async () => {
  const repository = repositoryFixture({ recipientState: 'SENDING', existingMessage: { state: 'SENDING', providerMessageId: null } });
  let calls = 0;
  await executeWhatsAppCampaignJob({
    job: repository.jobs[0], repository,
    messagingRegistry: new Map([['whatsapp', { async sendTemplate() { calls += 1; return { providerMessageId: 'bad' }; } }]]),
    now: new Date('2026-09-14T13:05:00.000Z')
  });
  assert.equal(calls, 0);
  assert.equal(repository.recipient.state, 'FAILED');
  assert.equal(repository.messages[0].errorCode, 'DELIVERY_UNCERTAIN');
});

test('scheduler WhatsApp-only mode passes only WHATSAPP_CAMPAIGN as allowed type', async () => {
  let callback;
  const calls = [];
  const loop = startSchedulerLoop({
    enabled: true,
    allowRealPublish: false,
    allowRealWhatsApp: true,
    repository: {},
    registry: new Map(),
    messagingRegistry: new Map([['whatsapp', {}]]),
    setIntervalImpl(fn) { callback = fn; return 'timer'; },
    clearIntervalImpl() {},
    tick: async (input) => { calls.push(input); return { claimed: 0 }; }
  });
  assert.equal(loop.started, true);
  await callback();
  assert.deepEqual(calls[0].allowedJobTypes, ['WHATSAPP_CAMPAIGN']);
});

test('scheduler social-only mode excludes WHATSAPP_CAMPAIGN from allowed types', async () => {
  let callback;
  const calls = [];
  startSchedulerLoop({
    enabled: true,
    allowRealPublish: true,
    allowRealWhatsApp: false,
    repository: {}, registry: new Map([['instagram', {}]]), messagingRegistry: new Map(),
    setIntervalImpl(fn) { callback = fn; return 'timer'; }, clearIntervalImpl() {},
    tick: async (input) => { calls.push(input); return { claimed: 0 }; }
  });
  await callback();
  assert.deepEqual(calls[0].allowedJobTypes.sort(), ['SOCIAL_PUBLICATION', 'STATUS_CHECK', 'TOKEN_REFRESH'].sort());
});
