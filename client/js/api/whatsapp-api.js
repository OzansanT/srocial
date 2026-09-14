import { requestJson } from './client.js';

function jsonOptions(method, body) {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

export function listWhatsAppContacts() {
  return requestJson('/api/whatsapp/contacts');
}

export function createWhatsAppContact(input) {
  return requestJson('/api/whatsapp/contacts', jsonOptions('POST', input));
}

export function setWhatsAppConsent(contactId, input) {
  return requestJson(`/api/whatsapp/contacts/${encodeURIComponent(contactId)}/consent`, jsonOptions('POST', input));
}

export function listWhatsAppTemplates() {
  return requestJson('/api/whatsapp/templates');
}

export function syncWhatsAppTemplates() {
  return requestJson('/api/whatsapp/templates/sync', { method: 'POST' });
}

export function listWhatsAppCampaigns() {
  return requestJson('/api/whatsapp/campaigns');
}

export function createWhatsAppCampaign(input) {
  return requestJson('/api/whatsapp/campaigns', jsonOptions('POST', input));
}
