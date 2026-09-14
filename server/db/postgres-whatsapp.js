import { randomUUID } from 'node:crypto';

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value ?? null;
}

function mapContact(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    phoneNumber: row.phone_number,
    displayName: row.display_name,
    consentStatus: row.consent_status,
    consentSource: row.consent_source,
    consentAt: timestamp(row.consent_at),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at)
  };
}

function mapTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    providerTemplateId: row.provider_template_id,
    name: row.name,
    language: row.language,
    category: row.category,
    status: row.status,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at)
  };
}

function mapCampaign(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    templateId: row.template_id,
    name: row.name,
    state: row.state,
    scheduledAt: timestamp(row.scheduled_at),
    templateComponents: row.template_components ?? [],
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at)
  };
}

function mapRecipient(row) {
  if (!row) return null;
  return {
    id: row.id,
    campaignId: row.campaign_id,
    contactId: row.contact_id,
    state: row.state,
    createdAt: timestamp(row.created_at)
  };
}

function mapJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    publicationId: row.publication_id,
    campaignId: row.campaign_id,
    accountId: row.account_id,
    state: row.state,
    scheduledAt: timestamp(row.scheduled_at),
    attempts: Number(row.attempts ?? 0),
    lockedAt: timestamp(row.locked_at),
    lockedBy: row.locked_by,
    errorCode: row.error_code,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at)
  };
}

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    campaignId: row.campaign_id,
    campaignRecipientId: row.campaign_recipient_id,
    contactId: row.contact_id,
    providerMessageId: row.provider_message_id,
    state: row.state,
    errorCode: row.error_code,
    sentAt: timestamp(row.sent_at),
    deliveredAt: timestamp(row.delivered_at),
    readAt: timestamp(row.read_at),
    failedAt: timestamp(row.failed_at),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at)
  };
}

async function updateWhitelisted(database, table, id, patch, columns, mapper) {
  const assignments = [];
  const values = [];
  for (const [key, column] of Object.entries(columns)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key) || patch[key] === undefined) continue;
    const value = table === 'campaigns' && key === 'templateComponents'
      ? JSON.stringify(patch[key] ?? [])
      : patch[key];
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  }
  if (!assignments.length) {
    const result = await database.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    return mapper(result.rows[0] ?? null);
  }
  values.push(id);
  const result = await database.query(
    `UPDATE ${table} SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return mapper(result.rows[0] ?? null);
}

async function withTransaction(database, work) {
  if (typeof database?.connect !== 'function') throw new Error('POSTGRES_TRANSACTION_CLIENT_REQUIRED');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

const CONTACT_COLUMNS = Object.freeze({
  userId: 'user_id', phoneNumber: 'phone_number', displayName: 'display_name',
  consentStatus: 'consent_status', consentSource: 'consent_source', consentAt: 'consent_at',
  createdAt: 'created_at', updatedAt: 'updated_at'
});
const CAMPAIGN_COLUMNS = Object.freeze({
  userId: 'user_id', accountId: 'account_id', templateId: 'template_id', name: 'name',
  state: 'state', scheduledAt: 'scheduled_at', templateComponents: 'template_components',
  createdAt: 'created_at', updatedAt: 'updated_at'
});
const RECIPIENT_COLUMNS = Object.freeze({ state: 'state' });
const MESSAGE_COLUMNS = Object.freeze({
  providerMessageId: 'provider_message_id', state: 'state', errorCode: 'error_code',
  sentAt: 'sent_at', deliveredAt: 'delivered_at', readAt: 'read_at', failedAt: 'failed_at',
  updatedAt: 'updated_at'
});

export function createPostgresWhatsApp(database) {
  return {
    async createContact(record) {
      const id = randomUUID();
      const result = await database.query(
        `INSERT INTO contacts (
          id, user_id, phone_number, display_name, consent_status, consent_source, consent_at, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [id, record.userId ?? null, record.phoneNumber, record.displayName ?? null,
          record.consentStatus ?? 'UNKNOWN', record.consentSource ?? null, record.consentAt ?? null,
          record.createdAt ?? new Date(), record.updatedAt ?? record.createdAt ?? new Date()]
      );
      return mapContact(result.rows[0]);
    },
    updateContact(id, patch) {
      return updateWhitelisted(database, 'contacts', id, patch, CONTACT_COLUMNS, mapContact);
    },
    async getContact(id) {
      const result = await database.query('SELECT * FROM contacts WHERE id = $1', [id]);
      return mapContact(result.rows[0] ?? null);
    },
    async listContacts() {
      const result = await database.query('SELECT * FROM contacts ORDER BY created_at, id');
      return result.rows.map(mapContact);
    },
    async upsertWhatsAppTemplate(record) {
      const existing = record.providerTemplateId
        ? await database.query('SELECT id FROM whatsapp_templates WHERE provider_template_id = $1 LIMIT 1', [record.providerTemplateId])
        : { rows: [] };
      const id = existing.rows[0]?.id ?? randomUUID();
      const result = await database.query(
        `INSERT INTO whatsapp_templates (
          id, account_id, provider_template_id, name, language, category, status, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (provider_template_id) WHERE provider_template_id IS NOT NULL DO UPDATE SET
          account_id = EXCLUDED.account_id,
          name = EXCLUDED.name,
          language = EXCLUDED.language,
          category = EXCLUDED.category,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at
        RETURNING *`,
        [id, record.accountId ?? null, record.providerTemplateId ?? null, record.name, record.language,
          record.category ?? null, record.status, record.createdAt ?? new Date(),
          record.updatedAt ?? record.createdAt ?? new Date()]
      );
      return mapTemplate(result.rows[0]);
    },
    async getWhatsAppTemplate(id) {
      const result = await database.query('SELECT * FROM whatsapp_templates WHERE id = $1', [id]);
      return mapTemplate(result.rows[0] ?? null);
    },
    async listWhatsAppTemplates() {
      const result = await database.query('SELECT * FROM whatsapp_templates ORDER BY name, language, id');
      return result.rows.map(mapTemplate);
    },
    async createCampaign(record) {
      const id = randomUUID();
      const result = await database.query(
        `INSERT INTO campaigns (
          id, user_id, account_id, template_id, name, state, scheduled_at, template_components, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [id, record.userId ?? null, record.accountId ?? null, record.templateId ?? null, record.name,
          record.state, record.scheduledAt, JSON.stringify(record.templateComponents ?? []),
          record.createdAt ?? new Date(), record.updatedAt ?? record.createdAt ?? new Date()]
      );
      return mapCampaign(result.rows[0]);
    },
    createWhatsAppCampaignGraph({ campaign, recipients = [], job } = {}) {
      return withTransaction(database, async (client) => {
        const campaignId = randomUUID();
        const campaignResult = await client.query(
          `INSERT INTO campaigns (
            id, user_id, account_id, template_id, name, state, scheduled_at, template_components, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [campaignId, campaign.userId ?? null, campaign.accountId ?? null, campaign.templateId ?? null, campaign.name,
            campaign.state, campaign.scheduledAt, JSON.stringify(campaign.templateComponents ?? []),
            campaign.createdAt ?? new Date(), campaign.updatedAt ?? campaign.createdAt ?? new Date()]
        );
        const createdCampaign = mapCampaign(campaignResult.rows[0]);

        const createdRecipients = [];
        for (const record of recipients) {
          const result = await client.query(
            `INSERT INTO campaign_recipients (id, campaign_id, contact_id, state, created_at)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [randomUUID(), campaignId, record.contactId, record.state ?? 'QUEUED', record.createdAt ?? new Date()]
          );
          createdRecipients.push(mapRecipient(result.rows[0]));
        }

        const jobRecord = job ?? {};
        const jobResult = await client.query(
          `INSERT INTO scheduler_jobs (
            id, type, publication_id, campaign_id, account_id, state, scheduled_at,
            attempts, locked_at, locked_by, error_code, created_at, updated_at
          ) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [randomUUID(), jobRecord.type, campaignId, jobRecord.accountId ?? createdCampaign.accountId ?? null,
            jobRecord.state, jobRecord.scheduledAt, Number(jobRecord.attempts ?? 0), jobRecord.lockedAt ?? null,
            jobRecord.lockedBy ?? null, jobRecord.errorCode ?? null, jobRecord.createdAt ?? new Date(),
            jobRecord.updatedAt ?? jobRecord.createdAt ?? new Date()]
        );

        return { campaign: createdCampaign, recipients: createdRecipients, job: mapJob(jobResult.rows[0]) };
      });
    },
    updateCampaign(id, patch) {
      return updateWhitelisted(database, 'campaigns', id, patch, CAMPAIGN_COLUMNS, mapCampaign);
    },
    async getCampaign(id) {
      const result = await database.query('SELECT * FROM campaigns WHERE id = $1', [id]);
      return mapCampaign(result.rows[0] ?? null);
    },
    async listCampaigns() {
      const result = await database.query('SELECT * FROM campaigns ORDER BY scheduled_at, id');
      return result.rows.map(mapCampaign);
    },
    async createCampaignRecipient(record) {
      const id = randomUUID();
      const result = await database.query(
        `INSERT INTO campaign_recipients (id, campaign_id, contact_id, state, created_at)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [id, record.campaignId, record.contactId, record.state ?? 'QUEUED', record.createdAt ?? new Date()]
      );
      return mapRecipient(result.rows[0]);
    },
    updateCampaignRecipient(id, patch) {
      return updateWhitelisted(database, 'campaign_recipients', id, patch, RECIPIENT_COLUMNS, mapRecipient);
    },
    async getCampaignRecipient(id) {
      const result = await database.query('SELECT * FROM campaign_recipients WHERE id = $1', [id]);
      return mapRecipient(result.rows[0] ?? null);
    },
    async listCampaignRecipients(campaignId) {
      const result = await database.query(
        'SELECT * FROM campaign_recipients WHERE campaign_id = $1 ORDER BY created_at, id', [campaignId]
      );
      return result.rows.map(mapRecipient);
    },
    async createWhatsAppMessage(record) {
      const id = randomUUID();
      const result = await database.query(
        `INSERT INTO whatsapp_messages (
          id, campaign_id, campaign_recipient_id, contact_id, provider_message_id, state, error_code,
          sent_at, delivered_at, read_at, failed_at, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [id, record.campaignId ?? null, record.campaignRecipientId ?? null, record.contactId ?? null,
          record.providerMessageId ?? null, record.state, record.errorCode ?? null, record.sentAt ?? null,
          record.deliveredAt ?? null, record.readAt ?? null, record.failedAt ?? null,
          record.createdAt ?? new Date(), record.updatedAt ?? record.createdAt ?? new Date()]
      );
      return mapMessage(result.rows[0]);
    },
    updateWhatsAppMessage(id, patch) {
      return updateWhitelisted(database, 'whatsapp_messages', id, patch, MESSAGE_COLUMNS, mapMessage);
    },
    async findWhatsAppMessageByProviderId(providerMessageId) {
      const result = await database.query(
        'SELECT * FROM whatsapp_messages WHERE provider_message_id = $1 LIMIT 1', [providerMessageId]
      );
      return mapMessage(result.rows[0] ?? null);
    },
    async findLatestWhatsAppMessageForRecipient(campaignRecipientId) {
      const result = await database.query(
        `SELECT * FROM whatsapp_messages WHERE campaign_recipient_id = $1
         ORDER BY created_at DESC, id DESC LIMIT 1`, [campaignRecipientId]
      );
      return mapMessage(result.rows[0] ?? null);
    },
    async listWhatsAppMessages({ campaignId = null } = {}) {
      const result = campaignId
        ? await database.query('SELECT * FROM whatsapp_messages WHERE campaign_id = $1 ORDER BY created_at, id', [campaignId])
        : await database.query('SELECT * FROM whatsapp_messages ORDER BY created_at, id');
      return result.rows.map(mapMessage);
    }
  };
}