import { ValidationError } from './post-service.js';
import { JOB_TYPES } from '../scheduler/job-types.js';
import { JOB_STATES } from '../scheduler/job-states.js';

function fail(details) {
  throw new ValidationError(details);
}

export async function createWhatsAppCampaign({ repository, input, now = new Date() } = {}) {
  const name = String(input?.name ?? '').trim();
  const templateId = String(input?.templateId ?? '').trim();
  const scheduledMs = Date.parse(input?.scheduledAt ?? '');
  const contactIds = [...new Set((Array.isArray(input?.contactIds) ? input.contactIds : [])
    .map((id) => String(id ?? '').trim()).filter(Boolean))];
  const templateComponents = Array.isArray(input?.templateComponents) ? structuredClone(input.templateComponents) : [];
  const details = [];
  if (!name) details.push({ field: 'name', message: 'Campaign name is required.' });
  if (!templateId) details.push({ field: 'templateId', message: 'Approved template is required.' });
  if (!Number.isFinite(scheduledMs) || scheduledMs <= now.getTime()) details.push({ field: 'scheduledAt', message: 'Schedule must be in the future.' });
  if (!contactIds.length) details.push({ field: 'contactIds', message: 'Select at least one recipient.' });
  if (details.length) fail(details);

  const template = await repository.getWhatsAppTemplate(templateId);
  if (!template || String(template.status).toUpperCase() !== 'APPROVED') {
    fail([{ field: 'templateId', message: 'Template must exist and be approved.' }]);
  }

  const contacts = [];
  for (const contactId of contactIds) {
    const contact = await repository.getContact(contactId);
    if (!contact) details.push({ field: 'contactIds', message: `Contact ${contactId} was not found.` });
    else if (String(contact.consentStatus).toUpperCase() !== 'OPTED_IN') details.push({ field: 'contactIds', message: `Contact ${contactId} is not opted in.` });
    else contacts.push(contact);
  }
  if (details.length) fail(details);

  const timestamp = now.toISOString();
  const campaign = await repository.createCampaign({
    userId: null,
    accountId: template.accountId ?? null,
    templateId: template.id,
    name,
    state: 'SCHEDULED',
    scheduledAt: new Date(scheduledMs).toISOString(),
    templateComponents,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  const recipients = [];
  for (const contact of contacts) {
    recipients.push(await repository.createCampaignRecipient({
      campaignId: campaign.id,
      contactId: contact.id,
      state: 'QUEUED',
      createdAt: timestamp
    }));
  }
  const job = await repository.createJob({
    type: JOB_TYPES.WHATSAPP_CAMPAIGN,
    campaignId: campaign.id,
    state: JOB_STATES.SCHEDULED,
    scheduledAt: campaign.scheduledAt,
    attempts: 0,
    lockedAt: null,
    lockedBy: null,
    errorCode: null,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  return { campaign, recipients, job };
}

export async function listWhatsAppCampaigns(repository) {
  const campaigns = await repository.listCampaigns();
  const result = [];
  for (const campaign of campaigns) {
    const recipients = await repository.listCampaignRecipients(campaign.id);
    result.push({
      ...campaign,
      recipientSummary: recipients.reduce((summary, recipient) => {
        summary.total += 1;
        summary[recipient.state] = (summary[recipient.state] ?? 0) + 1;
        return summary;
      }, { total: 0 })
    });
  }
  return result;
}
