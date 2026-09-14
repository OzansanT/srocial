import { JOB_STATES } from '../job-states.js';
import { classifyExecutionError, getRetryDelayMs } from '../retry-policy.js';
import { recordProviderFailure, recordProviderSuccess } from '../../operations/provider-telemetry.js';

function isEligibleRecipient(state) {
  return state === 'QUEUED' || state === 'RETRYING' || state === 'SENDING';
}

async function failUncertain(repository, recipient, message, now) {
  const at = now.toISOString();
  if (message) {
    await repository.updateWhatsAppMessage(message.id, {
      state: 'FAILED', errorCode: 'DELIVERY_UNCERTAIN', failedAt: at, updatedAt: at
    });
  }
  await repository.updateCampaignRecipient(recipient.id, { state: 'FAILED' });
}

export async function executeWhatsAppCampaignJob({
  job,
  repository,
  messagingRegistry = new Map(),
  now = new Date(),
  retryPolicy = { classifyExecutionError, getRetryDelayMs }
} = {}) {
  const adapter = messagingRegistry.get('whatsapp');
  if (!adapter) throw Object.assign(new Error('WhatsApp adapter unavailable'), { code: 'ADAPTER_UNAVAILABLE' });
  const campaign = await repository.getCampaign(job.campaignId);
  if (!campaign) throw Object.assign(new Error('Campaign unavailable'), { code: 'CAMPAIGN_NOT_FOUND' });
  const template = await repository.getWhatsAppTemplate(campaign.templateId);
  if (!template || String(template.status).toUpperCase() !== 'APPROVED') {
    throw Object.assign(new Error('Approved template unavailable'), { code: 'TEMPLATE_UNAVAILABLE' });
  }

  const recipients = await repository.listCampaignRecipients(campaign.id);
  let hasRetry = false;
  let hasFailure = false;
  let sentCount = 0;
  const at = now.toISOString();

  await repository.updateCampaign(campaign.id, { state: 'SENDING', updatedAt: at });

  for (const recipient of recipients) {
    if (!isEligibleRecipient(recipient.state)) continue;
    const latest = await repository.findLatestWhatsAppMessageForRecipient(recipient.id);
    if (latest?.state === 'SENDING' && !latest.providerMessageId) {
      await failUncertain(repository, recipient, latest, now);
      hasFailure = true;
      continue;
    }
    if (['SENT', 'DELIVERED', 'READ'].includes(latest?.state)) continue;

    const contact = await repository.getContact(recipient.contactId);
    if (!contact || String(contact.consentStatus).toUpperCase() !== 'OPTED_IN') {
      await repository.updateCampaignRecipient(recipient.id, { state: 'FAILED' });
      hasFailure = true;
      continue;
    }

    const message = await repository.createWhatsAppMessage({
      campaignId: campaign.id,
      campaignRecipientId: recipient.id,
      contactId: contact.id,
      providerMessageId: null,
      state: 'SENDING',
      errorCode: null,
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      failedAt: null,
      createdAt: at,
      updatedAt: at
    });
    await repository.updateCampaignRecipient(recipient.id, { state: 'SENDING' });

    try {
      const result = await adapter.sendTemplate({
        to: contact.phoneNumber,
        template,
        components: campaign.templateComponents ?? []
      });
      await repository.updateWhatsAppMessage(message.id, {
        providerMessageId: result.providerMessageId,
        state: 'SENT',
        sentAt: at,
        errorCode: null,
        updatedAt: at
      });
      await repository.updateCampaignRecipient(recipient.id, { state: 'SENT' });
      await recordProviderSuccess(repository, 'whatsapp', { now });
      sentCount += 1;
    } catch (error) {
      const classification = retryPolicy.classifyExecutionError(error);
      if (classification.code === 'RATE_LIMIT' && classification.retryable) {
        await repository.updateWhatsAppMessage(message.id, {
          state: 'FAILED', errorCode: 'RATE_LIMIT', failedAt: at, updatedAt: at
        });
        await repository.updateCampaignRecipient(recipient.id, { state: 'RETRYING' });
        hasRetry = true;
      } else if (classification.code === 'NETWORK_ERROR' || classification.code === 'TIMEOUT') {
        await failUncertain(repository, recipient, message, now);
        hasFailure = true;
      } else {
        await repository.updateWhatsAppMessage(message.id, {
          state: 'FAILED', errorCode: classification.code, failedAt: at, updatedAt: at
        });
        await repository.updateCampaignRecipient(recipient.id, { state: 'FAILED' });
        hasFailure = true;
      }
      const retryAt = classification.code === 'RATE_LIMIT' && classification.retryable
        ? new Date(now.getTime() + retryPolicy.getRetryDelayMs(job.attempts))
        : null;
      await recordProviderFailure(repository, 'whatsapp', classification.code, { now, limitedUntil: retryAt });
    }
  }

  if (hasRetry) {
    const retryAt = new Date(now.getTime() + retryPolicy.getRetryDelayMs(job.attempts));
    await repository.updateJob(job.id, {
      state: JOB_STATES.RETRYING,
      scheduledAt: retryAt.toISOString(),
      lockedAt: null,
      lockedBy: null,
      errorCode: 'RATE_LIMIT',
      updatedAt: at
    });
    await repository.updateCampaign(campaign.id, { state: 'SENDING', updatedAt: at });
    return { status: JOB_STATES.RETRYING, sentCount, errorCode: 'RATE_LIMIT' };
  }

  const finalState = hasFailure ? 'COMPLETED_WITH_FAILURES' : 'COMPLETED';
  await repository.updateCampaign(campaign.id, { state: finalState, updatedAt: at });
  await repository.updateJob(job.id, {
    state: JOB_STATES.COMPLETED,
    lockedAt: null,
    lockedBy: null,
    errorCode: null,
    updatedAt: at
  });
  return { status: JOB_STATES.COMPLETED, sentCount, campaignState: finalState };
}
