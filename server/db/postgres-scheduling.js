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

const POST_COLUMNS = Object.freeze({
  caption: 'caption',
  scheduledAt: 'scheduled_at',
  updatedAt: 'updated_at'
});
const PUBLICATION_COLUMNS = Object.freeze({
  state: 'state',
  scheduledAt: 'scheduled_at',
  errorCode: 'error_code',
  updatedAt: 'updated_at'
});
const JOB_COLUMNS = Object.freeze({
  state: 'state',
  scheduledAt: 'scheduled_at',
  attempts: 'attempts',
  lockedAt: 'locked_at',
  lockedBy: 'locked_by',
  errorCode: 'error_code',
  updatedAt: 'updated_at'
});

function staleStateError() {
  const error = new Error('LIFECYCLE_STALE_STATE');
  error.code = 'LIFECYCLE_STALE_STATE';
  return error;
}

function assertExpected(item, expected) {
  if (!expected || typeof expected !== 'object') return;
  for (const [key, value] of Object.entries(expected)) {
    const actual = item?.[key] ?? null;
    const wanted = value ?? null;
    if (!Object.is(actual, wanted)) throw staleStateError();
  }
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

async function updateWhitelisted(client, table, id, patch, columns) {
  const assignments = [];
  const values = [];
  for (const [key, column] of Object.entries(columns)) {
    if (!Object.prototype.hasOwnProperty.call(patch ?? {}, key) || patch[key] === undefined) continue;
    values.push(patch[key]);
    assignments.push(`${column} = $${values.length}`);
  }
  if (!assignments.length) return;
  values.push(id);
  const result = await client.query(
    `UPDATE ${table} SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING id`,
    values
  );
  if (!result.rows.length) throw new Error('LIFECYCLE_RECORD_NOT_FOUND');
}

async function loadPostOperations(client) {
  const postsResult = await client.query('SELECT * FROM posts ORDER BY scheduled_at, id');
  const mediaResult = await client.query('SELECT * FROM media ORDER BY post_id, sort_order, created_at, id');
  const publicationsResult = await client.query('SELECT * FROM publications ORDER BY scheduled_at, id');
  const jobsResult = await client.query('SELECT * FROM scheduler_jobs WHERE publication_id IS NOT NULL ORDER BY scheduled_at, id');
  const media = mediaResult.rows.map(mapMedia);
  const jobs = jobsResult.rows.map(mapJob);
  const publications = publicationsResult.rows.map(mapPublication).map((publication) => ({
    ...publication,
    jobs: jobs.filter((job) => job.publicationId === publication.id)
  }));
  return postsResult.rows.map((row) => {
    const post = mapPost(row);
    return {
      ...post,
      media: media.filter((item) => item.postId === post.id),
      publications: publications.filter((item) => item.postId === post.id)
    };
  });
}

async function lockLifecycleRows(client, mutations) {
  const orderedMutations = [...mutations].sort((a, b) => String(a.postId).localeCompare(String(b.postId)));
  for (const mutation of orderedMutations) {
    const postResult = await client.query('SELECT id FROM posts WHERE id = $1 FOR UPDATE', [mutation.postId]);
    if (!postResult.rows.length) throw new Error('LIFECYCLE_POST_NOT_FOUND');

    const publicationPatches = [...(mutation.publicationPatches ?? [])]
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    for (const item of publicationPatches) {
      const result = await client.query(
        'SELECT * FROM publications WHERE id = $1 AND post_id = $2 FOR UPDATE',
        [item.id, mutation.postId]
      );
      if (!result.rows.length) throw new Error('LIFECYCLE_PUBLICATION_NOT_FOUND');
      assertExpected(mapPublication(result.rows[0]), item.expected);
    }

    const jobPatches = [...(mutation.jobPatches ?? [])]
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    for (const item of jobPatches) {
      const result = await client.query(
        `SELECT j.*
         FROM scheduler_jobs j
         JOIN publications p ON p.id = j.publication_id
         WHERE j.id = $1 AND p.post_id = $2
         FOR UPDATE OF j`,
        [item.id, mutation.postId]
      );
      if (!result.rows.length) throw new Error('LIFECYCLE_JOB_NOT_FOUND');
      assertExpected(mapJob(result.rows[0]), item.expected);
    }
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
    },

    listPostOperations() {
      return loadPostOperations(database);
    },

    async getPostOperation(postId) {
      return (await loadPostOperations(database)).find((post) => post.id === postId) ?? null;
    },

    async getPublicationOperation(publicationId) {
      for (const post of await loadPostOperations(database)) {
        const publication = post.publications.find((item) => item.id === publicationId);
        if (publication) return { post, publication };
      }
      return null;
    },

    applyPostLifecycleMutations({ mutations = [] } = {}) {
      return withTransaction(database, async (client) => {
        await lockLifecycleRows(client, mutations);
        for (const mutation of mutations) {
          await updateWhitelisted(client, 'posts', mutation.postId, mutation.postPatch ?? {}, POST_COLUMNS);
          for (const item of mutation.publicationPatches ?? []) {
            await updateWhitelisted(client, 'publications', item.id, item.patch ?? {}, PUBLICATION_COLUMNS);
          }
          for (const item of mutation.jobPatches ?? []) {
            await updateWhitelisted(client, 'scheduler_jobs', item.id, item.patch ?? {}, JOB_COLUMNS);
          }
        }
        const operations = await loadPostOperations(client);
        return mutations.map((mutation) => {
          const post = operations.find((item) => item.id === mutation.postId);
          if (!post) throw new Error('LIFECYCLE_POST_NOT_FOUND');
          return post;
        });
      });
    }
  };
}
