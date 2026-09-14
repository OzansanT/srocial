import { randomUUID } from 'node:crypto';

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value ?? null;
}

function mapPost(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    caption: row.caption,
    scheduledAt: timestamp(row.scheduled_at),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at)
  };
}

function mapMedia(row) {
  if (!row) return null;
  return {
    id: row.id,
    postId: row.post_id,
    type: row.type,
    url: row.url,
    sortOrder: row.sort_order,
    metadata: row.metadata ?? {},
    createdAt: timestamp(row.created_at)
  };
}

function mapPublication(row) {
  if (!row) return null;
  return {
    id: row.id,
    postId: row.post_id,
    accountId: row.account_id,
    platform: row.platform,
    state: row.state,
    scheduledAt: timestamp(row.scheduled_at),
    providerOptions: row.provider_options ?? {},
    externalId: row.external_id,
    externalUrl: row.external_url,
    errorCode: row.error_code,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at)
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

export function createPostgresScheduling(database) {
  return {
    createSocialScheduleGraph({ post, media = [], publicationPlans = [] } = {}) {
      return withTransaction(database, async (client) => {
        const postId = randomUUID();
        const postResult = await client.query(
          `INSERT INTO posts (id, user_id, caption, scheduled_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [
            postId,
            post.userId ?? null,
            post.caption,
            post.scheduledAt,
            post.createdAt ?? new Date(),
            post.updatedAt ?? post.createdAt ?? new Date()
          ]
        );
        const createdPost = mapPost(postResult.rows[0]);

        const createdMedia = [];
        for (const record of media) {
          const result = await client.query(
            `INSERT INTO media (id, post_id, type, url, sort_order, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [randomUUID(), postId, record.type, record.url, record.sortOrder ?? 0,
              record.metadata ?? {}, record.createdAt ?? new Date()]
          );
          createdMedia.push(mapMedia(result.rows[0]));
        }

        const publications = [];
        const jobs = [];
        for (const plan of publicationPlans) {
          const publicationId = randomUUID();
          const publicationRecord = plan.publication ?? {};
          const publicationResult = await client.query(
            `INSERT INTO publications (
              id, post_id, account_id, platform, state, scheduled_at, provider_options, external_id,
              external_url, error_code, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [
              publicationId,
              postId,
              publicationRecord.accountId ?? null,
              publicationRecord.platform,
              publicationRecord.state,
              publicationRecord.scheduledAt,
              publicationRecord.providerOptions ?? {},
              publicationRecord.externalId ?? null,
              publicationRecord.externalUrl ?? null,
              publicationRecord.errorCode ?? null,
              publicationRecord.createdAt ?? new Date(),
              publicationRecord.updatedAt ?? publicationRecord.createdAt ?? new Date()
            ]
          );
          const publication = mapPublication(publicationResult.rows[0]);
          publications.push(publication);

          const jobRecord = plan.job ?? {};
          const jobResult = await client.query(
            `INSERT INTO scheduler_jobs (
              id, type, publication_id, campaign_id, account_id, state, scheduled_at,
              attempts, locked_at, locked_by, error_code, created_at, updated_at
            ) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [
              randomUUID(),
              jobRecord.type,
              publicationId,
              jobRecord.accountId ?? publication.accountId ?? null,
              jobRecord.state,
              jobRecord.scheduledAt,
              Number(jobRecord.attempts ?? 0),
              jobRecord.lockedAt ?? null,
              jobRecord.lockedBy ?? null,
              jobRecord.errorCode ?? null,
              jobRecord.createdAt ?? new Date(),
              jobRecord.updatedAt ?? jobRecord.createdAt ?? new Date()
            ]
          );
          jobs.push(mapJob(jobResult.rows[0]));
        }

        return { post: createdPost, media: createdMedia, publications, jobs };
      });
    }
  };
}
