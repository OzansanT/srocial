import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const REQUIRED_TABLES = Object.freeze([
  'accounts',
  'oauth_states',
  'posts',
  'media',
  'publications',
  'scheduler_jobs'
]);

const ACCOUNT_UPDATE_COLUMNS = Object.freeze({
  userId: 'user_id',
  provider: 'platform',
  providerAccountId: 'provider_account_id',
  displayName: 'display_name',
  username: 'username',
  state: 'connection_state',
  scopes: 'scopes',
  accessTokenEncrypted: 'access_token_encrypted',
  refreshTokenEncrypted: 'refresh_token_encrypted',
  tokenExpiresAt: 'token_expires_at',
  connectedAt: 'connected_at',
  disconnectedAt: 'disconnected_at',
  lastErrorCode: 'last_error_code',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

const PUBLICATION_UPDATE_COLUMNS = Object.freeze({
  postId: 'post_id',
  accountId: 'account_id',
  platform: 'platform',
  state: 'state',
  scheduledAt: 'scheduled_at',
  externalId: 'external_id',
  externalUrl: 'external_url',
  errorCode: 'error_code',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

const JOB_UPDATE_COLUMNS = Object.freeze({
  type: 'type',
  publicationId: 'publication_id',
  campaignId: 'campaign_id',
  accountId: 'account_id',
  state: 'state',
  scheduledAt: 'scheduled_at',
  attempts: 'attempts',
  lockedAt: 'locked_at',
  lockedBy: 'locked_by',
  errorCode: 'error_code',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value ?? null;
}

function mapAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.platform,
    providerAccountId: row.provider_account_id,
    displayName: row.display_name,
    username: row.username,
    state: row.connection_state,
    scopes: row.scopes ?? [],
    accessTokenEncrypted: row.access_token_encrypted,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    tokenExpiresAt: timestamp(row.token_expires_at),
    connectedAt: timestamp(row.connected_at),
    disconnectedAt: timestamp(row.disconnected_at),
    lastErrorCode: row.last_error_code,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at)
  };
}

function mapOAuthState(row) {
  if (!row) return null;
  return {
    id: row.id,
    stateHash: row.state_hash,
    provider: row.provider,
    redirectUri: row.redirect_uri,
    expiresAt: timestamp(row.expires_at),
    consumedAt: timestamp(row.consumed_at),
    createdAt: timestamp(row.created_at)
  };
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

async function updateWhitelisted(database, table, id, patch, columns, mapper) {
  const assignments = [];
  const values = [];
  for (const [key, column] of Object.entries(columns)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key) || patch[key] === undefined) continue;
    values.push(patch[key]);
    assignments.push(`${column} = $${values.length}`);
  }

  if (table === 'accounts' && Object.prototype.hasOwnProperty.call(patch, 'state') && patch.state !== undefined) {
    values.push(patch.state === 'CONNECTED');
    assignments.push(`connected = $${values.length}`);
  }

  if (assignments.length === 0) {
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

export function createPostgresRepository({ connectionString, pool = null } = {}) {
  const url = String(connectionString ?? '').trim();
  if (!pool && !url) throw new Error('DATABASE_URL_REQUIRED');
  const database = pool ?? new Pool({ connectionString: url });
  const ownsPool = !pool;

  return {
    async initialize() {
      const result = await database.query(
        'SELECT table_name, to_regclass(table_name) AS regclass FROM unnest($1::text[]) AS required(table_name)',
        [REQUIRED_TABLES]
      );
      const present = new Set(result.rows.filter((row) => row.regclass != null).map((row) => row.table_name));
      if (REQUIRED_TABLES.some((table) => !present.has(table))) throw new Error('DATABASE_MIGRATIONS_REQUIRED');
    },

    async healthCheck() {
      await database.query('SELECT 1 AS ok');
      return { ok: true, backend: 'postgres' };
    },

    async close() {
      if (ownsPool) await database.end();
    },

    async createAccount(record) {
      const id = randomUUID();
      const state = record.state ?? 'DISCONNECTED';
      const result = await database.query(
        `INSERT INTO accounts (
          id, user_id, platform, provider_account_id, display_name, username,
          connection_state, scopes, access_token_encrypted, refresh_token_encrypted,
          token_expires_at, connected, connected_at, disconnected_at, last_error_code,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
        ) RETURNING *`,
        [
          id,
          record.userId ?? null,
          record.provider,
          record.providerAccountId ?? null,
          record.displayName ?? null,
          record.username ?? null,
          state,
          record.scopes ?? [],
          record.accessTokenEncrypted ?? null,
          record.refreshTokenEncrypted ?? null,
          record.tokenExpiresAt ?? null,
          state === 'CONNECTED',
          record.connectedAt ?? null,
          record.disconnectedAt ?? null,
          record.lastErrorCode ?? null,
          record.createdAt ?? new Date(),
          record.updatedAt ?? record.createdAt ?? new Date()
        ]
      );
      return mapAccount(result.rows[0]);
    },

    updateAccount(id, patch) {
      return updateWhitelisted(database, 'accounts', id, patch, ACCOUNT_UPDATE_COLUMNS, mapAccount);
    },

    async getAccount(id) {
      const result = await database.query('SELECT * FROM accounts WHERE id = $1', [id]);
      return mapAccount(result.rows[0] ?? null);
    },

    async findAccountByProviderIdentity(provider, providerAccountId) {
      const result = await database.query(
        'SELECT * FROM accounts WHERE platform = $1 AND provider_account_id = $2 LIMIT 1',
        [provider, providerAccountId]
      );
      return mapAccount(result.rows[0] ?? null);
    },

    async listAccounts() {
      const result = await database.query('SELECT * FROM accounts ORDER BY created_at, id');
      return result.rows.map(mapAccount);
    },

    async createOAuthState(record) {
      const id = randomUUID();
      const result = await database.query(
        `INSERT INTO oauth_states (
          id, state_hash, provider, redirect_uri, expires_at, consumed_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          id,
          record.stateHash,
          record.provider,
          record.redirectUri,
          record.expiresAt,
          record.consumedAt ?? null,
          record.createdAt ?? new Date()
        ]
      );
      return mapOAuthState(result.rows[0]);
    },

    async getOAuthState(stateHash) {
      const result = await database.query('SELECT * FROM oauth_states WHERE state_hash = $1', [stateHash]);
      return mapOAuthState(result.rows[0] ?? null);
    },

    async consumeOAuthState(stateHash, { now = new Date() } = {}) {
      const result = await database.query(
        `UPDATE oauth_states
         SET consumed_at = $2
         WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > $2
         RETURNING *`,
        [stateHash, now]
      );
      return mapOAuthState(result.rows[0] ?? null);
    },

    async createMedia(record) {
      const id = randomUUID();
      const result = await database.query(
        `INSERT INTO media (id, post_id, type, url, sort_order, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          id,
          record.postId,
          record.type,
          record.url,
          record.sortOrder ?? 0,
          record.metadata ?? {},
          record.createdAt ?? new Date()
        ]
      );
      return mapMedia(result.rows[0]);
    },

    async listMedia() {
      const result = await database.query('SELECT * FROM media ORDER BY created_at, id');
      return result.rows.map(mapMedia);
    },

    async listMediaForPost(postId) {
      const result = await database.query(
        'SELECT * FROM media WHERE post_id = $1 ORDER BY sort_order, created_at, id',
        [postId]
      );
      return result.rows.map(mapMedia);
    },

    async createPost(record) {
      const id = randomUUID();
      const result = await database.query(
        `INSERT INTO posts (id, user_id, caption, scheduled_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          id,
          record.userId ?? null,
          record.caption,
          record.scheduledAt,
          record.createdAt ?? new Date(),
          record.updatedAt ?? record.createdAt ?? new Date()
        ]
      );
      return mapPost(result.rows[0]);
    },

    async createPublication(record) {
      const id = randomUUID();
      const result = await database.query(
        `INSERT INTO publications (
          id, post_id, account_id, platform, state, scheduled_at, external_id,
          external_url, error_code, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          id,
          record.postId,
          record.accountId ?? null,
          record.platform,
          record.state,
          record.scheduledAt,
          record.externalId ?? null,
          record.externalUrl ?? null,
          record.errorCode ?? null,
          record.createdAt ?? new Date(),
          record.updatedAt ?? record.createdAt ?? new Date()
        ]
      );
      return mapPublication(result.rows[0]);
    },

    async createJob(record) {
      const id = randomUUID();
      const result = await database.query(
        `INSERT INTO scheduler_jobs (
          id, type, publication_id, campaign_id, account_id, state, scheduled_at,
          attempts, locked_at, locked_by, error_code, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [
          id,
          record.type,
          record.publicationId ?? null,
          record.campaignId ?? null,
          record.accountId ?? null,
          record.state,
          record.scheduledAt,
          Number(record.attempts ?? 0),
          record.lockedAt ?? null,
          record.lockedBy ?? null,
          record.errorCode ?? null,
          record.createdAt ?? new Date(),
          record.updatedAt ?? record.createdAt ?? new Date()
        ]
      );
      return mapJob(result.rows[0]);
    },

    updatePublication(id, patch) {
      return updateWhitelisted(database, 'publications', id, patch, PUBLICATION_UPDATE_COLUMNS, mapPublication);
    },

    updateJob(id, patch) {
      return updateWhitelisted(database, 'scheduler_jobs', id, patch, JOB_UPDATE_COLUMNS, mapJob);
    },

    async getPost(id) {
      const result = await database.query('SELECT * FROM posts WHERE id = $1', [id]);
      return mapPost(result.rows[0] ?? null);
    },

    async getPublication(id) {
      const result = await database.query('SELECT * FROM publications WHERE id = $1', [id]);
      return mapPublication(result.rows[0] ?? null);
    },

    async claimDueJobs({ now = new Date(), workerId, limit = 10, lockTimeoutMs = 120000 } = {}) {
      if (!String(workerId ?? '').trim()) throw new Error('workerId is required');
      const nowMs = now.getTime();
      const staleBefore = new Date(nowMs - Math.max(0, Number(lockTimeoutMs) || 0));
      const maxJobs = Math.max(0, Number.parseInt(limit, 10) || 0);
      if (maxJobs === 0) return [];

      const result = await database.query(
        `WITH candidates AS (
           SELECT id
           FROM scheduler_jobs
           WHERE scheduled_at <= $1
             AND (
               state IN ('SCHEDULED', 'RETRYING')
               OR (
                 state = 'RUNNING'
                 AND (locked_at IS NULL OR locked_at <= $2)
               )
             )
           ORDER BY scheduled_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $3
         )
         UPDATE scheduler_jobs AS jobs
         SET state = 'RUNNING',
             locked_at = $1,
             locked_by = $4,
             attempts = jobs.attempts + 1,
             updated_at = $1
         FROM candidates
         WHERE jobs.id = candidates.id
         RETURNING jobs.*`,
        [now, staleBefore, maxJobs, workerId]
      );
      return result.rows.map(mapJob);
    },

    async listJobs() {
      const result = await database.query('SELECT * FROM scheduler_jobs ORDER BY scheduled_at, id');
      return result.rows.map(mapJob);
    },

    async listPostsWithPublications() {
      const [postsResult, publicationsResult] = await Promise.all([
        database.query('SELECT * FROM posts ORDER BY scheduled_at, id'),
        database.query('SELECT * FROM publications ORDER BY scheduled_at, id')
      ]);
      const publications = publicationsResult.rows.map(mapPublication);
      return postsResult.rows.map((row) => {
        const post = mapPost(row);
        return { ...post, publications: publications.filter((item) => item.postId === post.id) };
      });
    }
  };
}
