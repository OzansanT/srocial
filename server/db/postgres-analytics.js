import { randomUUID } from 'node:crypto';

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value ?? null;
}

function nullableNumber(value) {
  return value == null ? null : Number(value);
}

function mapSnapshot(row) {
  if (!row) return null;
  return {
    id: row.id,
    publicationId: row.publication_id,
    accountId: row.account_id,
    provider: row.provider,
    externalId: row.external_id,
    views: nullableNumber(row.views),
    reach: nullableNumber(row.reach),
    likes: nullableNumber(row.likes),
    comments: nullableNumber(row.comments),
    shares: nullableNumber(row.shares),
    saves: nullableNumber(row.saves),
    extraMetrics: row.extra_metrics ?? {},
    capturedAt: timestamp(row.captured_at)
  };
}

export function createPostgresAnalytics(database) {
  return {
    async createPublicationMetricSnapshot(record) {
      const result = await database.query(
        `INSERT INTO publication_metric_snapshots (
          id, publication_id, account_id, provider, external_id,
          views, reach, likes, comments, shares, saves, extra_metrics, captured_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [
          record.id ?? randomUUID(), record.publicationId, record.accountId ?? null,
          record.provider, record.externalId, record.views ?? null, record.reach ?? null,
          record.likes ?? null, record.comments ?? null, record.shares ?? null, record.saves ?? null,
          JSON.stringify(record.extraMetrics ?? {}), record.capturedAt ?? new Date()
        ]
      );
      return mapSnapshot(result.rows[0]);
    },
    async listPublicationMetricSnapshots({ publicationId = null, accountId = null, provider = null } = {}) {
      const clauses = [];
      const values = [];
      if (publicationId) { values.push(publicationId); clauses.push(`publication_id = $${values.length}`); }
      if (accountId) { values.push(accountId); clauses.push(`account_id = $${values.length}`); }
      if (provider) { values.push(provider); clauses.push(`provider = $${values.length}`); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const result = await database.query(
        `SELECT * FROM publication_metric_snapshots ${where} ORDER BY captured_at ASC, id ASC`,
        values
      );
      return result.rows.map(mapSnapshot);
    },
    async getLatestPublicationMetricSnapshot(publicationId) {
      const result = await database.query(
        `SELECT * FROM publication_metric_snapshots
         WHERE publication_id = $1
         ORDER BY captured_at DESC, id DESC
         LIMIT 1`,
        [publicationId]
      );
      return mapSnapshot(result.rows[0] ?? null);
    }
  };
}
