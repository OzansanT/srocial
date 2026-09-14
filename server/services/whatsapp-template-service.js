export async function syncWhatsAppTemplates({ repository, adapter, now = new Date() } = {}) {
  if (!repository || typeof repository.upsertWhatsAppTemplate !== 'function') throw new Error('WHATSAPP_REPOSITORY_REQUIRED');
  if (!adapter || typeof adapter.getTemplates !== 'function') throw new Error('WHATSAPP_ADAPTER_REQUIRED');
  const templates = await adapter.getTemplates();
  const timestamp = now.toISOString();
  const saved = [];
  for (const template of templates) {
    saved.push(await repository.upsertWhatsAppTemplate({
      accountId: template.accountId ?? null,
      providerTemplateId: template.providerTemplateId,
      name: template.name,
      language: template.language,
      category: template.category ?? null,
      status: template.status,
      createdAt: timestamp,
      updatedAt: timestamp
    }));
  }
  return saved;
}
