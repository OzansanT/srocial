import { createWhatsAppClient, WhatsAppProviderError } from './client.js';

function normalizeTemplate(item) {
  const providerTemplateId = String(item?.id ?? '').trim();
  const name = String(item?.name ?? '').trim();
  const language = String(item?.language ?? '').trim();
  const status = String(item?.status ?? '').trim().toUpperCase();
  if (!providerTemplateId || !name || !language || !status) {
    throw new WhatsAppProviderError('PROVIDER_RESPONSE_INVALID');
  }
  return {
    providerTemplateId,
    name,
    language,
    category: item?.category == null ? null : String(item.category).trim().toUpperCase(),
    status
  };
}

export function createWhatsAppAdapter({ config, fetchImpl = globalThis.fetch } = {}) {
  if (!config) throw new Error('WHATSAPP_CONFIG_REQUIRED');
  const client = createWhatsAppClient({ config, fetchImpl });

  async function getTemplates() {
    const payload = await client.get(`/${config.businessAccountId}/message_templates`, {
      query: { fields: 'id,name,language,category,status', limit: 250 }
    });
    if (!Array.isArray(payload?.data)) throw new WhatsAppProviderError('PROVIDER_RESPONSE_INVALID');
    return payload.data.map(normalizeTemplate);
  }

  async function sendTemplate({ to, template, components = [] } = {}) {
    if (!config.allowRealWhatsApp) throw new WhatsAppProviderError('REAL_WHATSAPP_DISABLED');
    const recipient = String(to ?? '').trim();
    const name = String(template?.name ?? '').trim();
    const language = String(template?.language ?? '').trim();
    if (!recipient || !name || !language) throw new WhatsAppProviderError('INVALID_REQUEST');

    const templatePayload = { name, language: { code: language } };
    if (Array.isArray(components) && components.length) templatePayload.components = components;

    const payload = await client.post(`/${config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'template',
      template: templatePayload
    });
    const providerMessageId = String(payload?.messages?.[0]?.id ?? '').trim();
    if (!providerMessageId) throw new WhatsAppProviderError('PROVIDER_RESPONSE_INVALID');
    return { providerMessageId };
  }

  return { getTemplates, sendTemplate };
}
