import { randomUUID } from 'node:crypto';

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value ?? null;
}

function mapDraft(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    caption: row.caption,
    scheduledAt: timestamp(row.scheduled_at),
    media: row.media ?? [],
    destinations: row.destinations ?? [],
    platformOverrides: row.platform_overrides ?? {},
    revision: Number(row.revision ?? 1),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at)
  };
}

function mapCaptionTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    caption: row.caption,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at)
  };
}

function mapHashtagCollection(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    tags: row.tags ?? [],
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at)
  };
}

function mapDestinationGroup(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    destinations: row.destinations ?? [],
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at)
  };
}

function revisionConflict() {
  const error = new Error('Draft revision conflict');
  error.code = 'DRAFT_REVISION_CONFLICT';
  return error;
}

export function createPostgresComposer(database) {
  return {
    async createDraft(record) {
      const id = randomUUID();
      const result = await database.query(
        `INSERT INTO composer_drafts (
          id, user_id, name, caption, scheduled_at, media, destinations, platform_overrides,
          revision, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [id, record.userId ?? null, record.name, record.caption ?? '', record.scheduledAt ?? null,
          JSON.stringify(record.media ?? []), JSON.stringify(record.destinations ?? []),
          JSON.stringify(record.platformOverrides ?? {}), Number(record.revision ?? 1),
          record.createdAt ?? new Date(), record.updatedAt ?? record.createdAt ?? new Date()]
      );
      return mapDraft(result.rows[0]);
    },
    async getDraft(id) {
      const result = await database.query('SELECT * FROM composer_drafts WHERE id = $1', [id]);
      return mapDraft(result.rows[0] ?? null);
    },
    async listDrafts() {
      const result = await database.query('SELECT * FROM composer_drafts ORDER BY updated_at DESC, id');
      return result.rows.map(mapDraft);
    },
    async updateDraft(id, patch, expectedRevision) {
      const assignments = [];
      const values = [];
      const columns = {
        userId: 'user_id', name: 'name', caption: 'caption', scheduledAt: 'scheduled_at',
        media: 'media', destinations: 'destinations', platformOverrides: 'platform_overrides', updatedAt: 'updated_at'
      };
      for (const [key, column] of Object.entries(columns)) {
        if (!Object.prototype.hasOwnProperty.call(patch, key) || patch[key] === undefined) continue;
        const value = ['media', 'destinations', 'platformOverrides'].includes(key)
          ? JSON.stringify(patch[key] ?? (key === 'platformOverrides' ? {} : []))
          : patch[key];
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
      }
      values.push(id, Number(expectedRevision));
      const idIndex = values.length - 1;
      const revisionIndex = values.length;
      const setClause = [...assignments, 'revision = revision + 1'].join(', ');
      const result = await database.query(
        `UPDATE composer_drafts SET ${setClause} WHERE id = $${idIndex} AND revision = $${revisionIndex} RETURNING *`,
        values
      );
      if (result.rows[0]) return mapDraft(result.rows[0]);
      const existing = await database.query('SELECT revision FROM composer_drafts WHERE id = $1', [id]);
      if (!existing.rows[0]) return null;
      throw revisionConflict();
    },
    async deleteDraft(id) {
      const result = await database.query('DELETE FROM composer_drafts WHERE id = $1 RETURNING id', [id]);
      return Boolean(result.rows[0]);
    },
    async createCaptionTemplate(record) {
      const result = await database.query(
        `INSERT INTO caption_templates (id, user_id, name, caption, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [randomUUID(), record.userId ?? null, record.name, record.caption,
          record.createdAt ?? new Date(), record.updatedAt ?? record.createdAt ?? new Date()]
      );
      return mapCaptionTemplate(result.rows[0]);
    },
    async listCaptionTemplates() {
      const result = await database.query('SELECT * FROM caption_templates ORDER BY name, id');
      return result.rows.map(mapCaptionTemplate);
    },
    async deleteCaptionTemplate(id) {
      const result = await database.query('DELETE FROM caption_templates WHERE id = $1 RETURNING id', [id]);
      return Boolean(result.rows[0]);
    },
    async createHashtagCollection(record) {
      const result = await database.query(
        `INSERT INTO hashtag_collections (id, user_id, name, tags, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [randomUUID(), record.userId ?? null, record.name, JSON.stringify(record.tags ?? []),
          record.createdAt ?? new Date(), record.updatedAt ?? record.createdAt ?? new Date()]
      );
      return mapHashtagCollection(result.rows[0]);
    },
    async listHashtagCollections() {
      const result = await database.query('SELECT * FROM hashtag_collections ORDER BY name, id');
      return result.rows.map(mapHashtagCollection);
    },
    async deleteHashtagCollection(id) {
      const result = await database.query('DELETE FROM hashtag_collections WHERE id = $1 RETURNING id', [id]);
      return Boolean(result.rows[0]);
    },
    async createDestinationGroup(record) {
      const result = await database.query(
        `INSERT INTO destination_groups (id, user_id, name, destinations, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [randomUUID(), record.userId ?? null, record.name, JSON.stringify(record.destinations ?? []),
          record.createdAt ?? new Date(), record.updatedAt ?? record.createdAt ?? new Date()]
      );
      return mapDestinationGroup(result.rows[0]);
    },
    async listDestinationGroups() {
      const result = await database.query('SELECT * FROM destination_groups ORDER BY name, id');
      return result.rows.map(mapDestinationGroup);
    },
    async deleteDestinationGroup(id) {
      const result = await database.query('DELETE FROM destination_groups WHERE id = $1 RETURNING id', [id]);
      return Boolean(result.rows[0]);
    }
  };
}