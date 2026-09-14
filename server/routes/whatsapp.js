import { ValidationError } from '../services/post-service.js';
import { createWhatsAppContact, setWhatsAppConsent } from '../services/whatsapp-contact-service.js';
import { createWhatsAppCampaign, listWhatsAppCampaigns } from '../services/whatsapp-campaign-service.js';
import { syncWhatsAppTemplates } from '../services/whatsapp-template-service.js';

function validationResponse(error) {
  if (error instanceof ValidationError || error?.code === 'VALIDATION_ERROR') {
    return { statusCode: 400, payload: { error: 'validation_error', details: error.details ?? [] } };
  }
  return null;
}

export async function listWhatsAppContactsPayload(repository) {
  return { statusCode: 200, payload: { contacts: await repository.listContacts() } };
}

export async function createWhatsAppContactPayload(repository, input, { now } = {}) {
  try {
    return { statusCode: 201, payload: { contact: await createWhatsAppContact({ repository, input, now }) } };
  } catch (error) {
    return validationResponse(error) ?? Promise.reject(error);
  }
}

export async function setWhatsAppConsentPayload(repository, contactId, input, { now } = {}) {
  try {
    return { statusCode: 200, payload: { contact: await setWhatsAppConsent({ repository, contactId, input, now }) } };
  } catch (error) {
    return validationResponse(error) ?? Promise.reject(error);
  }
}

export async function listWhatsAppTemplatesPayload(repository) {
  return { statusCode: 200, payload: { templates: await repository.listWhatsAppTemplates() } };
}

export async function syncWhatsAppTemplatesPayload(repository, adapter, { now } = {}) {
  if (!adapter) return { statusCode: 503, payload: { error: 'whatsapp_unavailable' } };
  const templates = await syncWhatsAppTemplates({ repository, adapter, now });
  return { statusCode: 200, payload: { templates } };
}

export async function listWhatsAppCampaignsPayload(repository) {
  return { statusCode: 200, payload: { campaigns: await listWhatsAppCampaigns(repository) } };
}

export async function createWhatsAppCampaignPayload(repository, input, { now } = {}) {
  try {
    return { statusCode: 201, payload: await createWhatsAppCampaign({ repository, input, now }) };
  } catch (error) {
    return validationResponse(error) ?? Promise.reject(error);
  }
}
