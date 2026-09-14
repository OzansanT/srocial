import { randomUUID } from 'node:crypto';

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value ?? null;
}

function mapAttempt(row) {
  if (!row) return null;
  return {
    id: row.id,
    publicationId: row.publication_id,
    attempt: Number(row.attempt ?? 0),
    state: row.state,
    providerErrorCode: row.provider_error_code,
    errorMessage: row.error_message,
    startedAt: timestamp(row.started_at),
    finishedAt: timestamp(row.finished_at)
  };
}

function mapWebhook(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    externalEventId: row.external_event_id,
    eventType: row.event_type,
    payload: row.payload ?? {},
    signatureValid: row.signature_valid === true,
    processingState: row.processing_state ?? 'RECEIVED',
    errorCode: row.error_code,
    receivedAt: timestamp(row.received_at),
    processedAt: timestamp(row.processed_at)
  };
}

function mapProviderStatus(row) {
  if (!row) return null;
  return {
    provider: row.provider,
    healthState: row.health_state,
    lastSuccessAt: timestamp(row.last_success_at),
    lastErrorAt: timestamp(row.last_error_at),
    lastErrorCode: row.last_error_code,
    limitedUntil: timestamp(row.limited_until),
    updatedAt: timestamp(row.updated_at)
  };
}

export function createPostgresOperations(database, { mapPublication } = {}) {
  return {
    async findPublicationByExternalId(platform, externalId) {
      const result = await database.query(
        'SELECT * FROM publications WHERE platform = $1 AND external_id = $2 ORDER BY created_at DESC LIMIT 1',
        [platform, externalId]
      );
      return mapPublication(result.rows[0] ?? null);
    },

    async createPublicationAttempt(record) {
      const id = randomUUID();
      const result = await database.query(
        `INSERT INTO publication_attempts (
          id, publication_id, attempt, state, provider_error_code, error_message, started_at, finished_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [id, record.publicationId, Number(record.attempt ?? 0), record.state,
          record.providerErrorCode ?? null, record.errorMessage ?? null,
          record.startedAt ?? new Date(), record.finishedAt ?? null]
      );
      return mapAttempt(result.rows[0]);
    },

    async updatePublicationAttempt(id, patch) {
      const assignments = [];
      const values = [];
      const columns = {
        state:'state', providerErrorCode:'provider_error_code', errorMessage:'error_message',
        startedAt:'started_at', finishedAt:'finished_at'
      };
      for (const [key, column] of Object.entries(columns)) {
        if (!Object.prototype.hasOwnProperty.call(patch, key) || patch[key] === undefined) continue;
        values.push(patch[key]);
        assignments.push(`${column} = $${values.length}`);
      }
      if (!assignments.length) {
        const result = await database.query('SELECT * FROM publication_attempts WHERE id = $1', [id]);
        return mapAttempt(result.rows[0] ?? null);
      }
      values.push(id);
      const result = await database.query(
        `UPDATE publication_attempts SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`, values
      );
      return mapAttempt(result.rows[0] ?? null);
    },

    async listPublicationAttempts({ limit = 50 } = {}) {
      const max = Math.max(0, Number.parseInt(limit, 10) || 0);
      const result = await database.query(
        'SELECT * FROM publication_attempts ORDER BY started_at DESC, id DESC LIMIT $1', [max]
      );
      return result.rows.map(mapAttempt);
    },

    async createWebhookEvent(record) {
      const id = randomUUID();
      const result = await database.query(
        `INSERT INTO webhook_events (
          id, provider, external_event_id, event_type, payload, signature_valid,
          processing_state, error_code, received_at, processed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [id, record.provider, record.externalEventId ?? null, record.eventType, record.payload ?? {},
          record.signatureValid === true, record.processingState ?? 'RECEIVED', record.errorCode ?? null,
          record.receivedAt ?? new Date(), record.processedAt ?? null]
      );
      return mapWebhook(result.rows[0]);
    },

    async getWebhookEventByExternalId(provider, externalEventId) {
      const result = await database.query(
        'SELECT * FROM webhook_events WHERE provider = $1 AND external_event_id = $2 LIMIT 1',
        [provider, externalEventId]
      );
      return mapWebhook(result.rows[0] ?? null);
    },

    async updateWebhookEvent(id, patch) {
      const assignments = [];
      const values = [];
      const columns = {
        eventType:'event_type', payload:'payload', signatureValid:'signature_valid',
        processingState:'processing_state', errorCode:'error_code', receivedAt:'received_at', processedAt:'processed_at'
      };
      for (const [key, column] of Object.entries(columns)) {
        if (!Object.prototype.hasOwnProperty.call(patch, key) || patch[key] === undefined) continue;
        values.push(patch[key]);
        assignments.push(`${column} = $${values.length}`);
      }
      if (!assignments.length) {
        const result = await database.query('SELECT * FROM webhook_events WHERE id = $1', [id]);
        return mapWebhook(result.rows[0] ?? null);
      }
      values.push(id);
      const result = await database.query(
        `UPDATE webhook_events SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`, values
      );
      return mapWebhook(result.rows[0] ?? null);
    },

    async listWebhookEvents({ limit = 50 } = {}) {
      const max = Math.max(0, Number.parseInt(limit, 10) || 0);
      const result = await database.query(
        'SELECT * FROM webhook_events ORDER BY received_at DESC, id DESC LIMIT $1', [max]
      );
      return result.rows.map(mapWebhook);
    },

    async upsertProviderStatus(provider, patch) {
      const current = await database.query('SELECT * FROM provider_status WHERE provider = $1', [provider]);
      const existing = mapProviderStatus(current.rows[0] ?? null) ?? {
        provider, healthState:'UNKNOWN', lastSuccessAt:null, lastErrorAt:null,
        lastErrorCode:null, limitedUntil:null, updatedAt:null
      };
      const merged = { ...existing, ...patch, provider };
      const result = await database.query(
        `INSERT INTO provider_status (
          provider, health_state, last_success_at, last_error_at, last_error_code, limited_until, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (provider) DO UPDATE SET
          health_state = EXCLUDED.health_state,
          last_success_at = EXCLUDED.last_success_at,
          last_error_at = EXCLUDED.last_error_at,
          last_error_code = EXCLUDED.last_error_code,
          limited_until = EXCLUDED.limited_until,
          updated_at = EXCLUDED.updated_at
        RETURNING *`,
        [provider, merged.healthState, merged.lastSuccessAt, merged.lastErrorAt,
          merged.lastErrorCode, merged.limitedUntil, merged.updatedAt ?? new Date()]
      );
      return mapProviderStatus(result.rows[0]);
    },

    async listProviderStatuses() {
      const result = await database.query('SELECT * FROM provider_status ORDER BY provider');
      return result.rows.map(mapProviderStatus);
    }
  };
}
