import { maintenanceError } from './errors.js';

export const POSTGRES_BACKUP_TABLES = Object.freeze([
  'users',
  'app_users',
  'accounts',
  'posts',
  'media',
  'publications',
  'publication_attempts',
  'contacts',
  'contact_lists',
  'contact_list_members',
  'whatsapp_templates',
  'campaigns',
  'campaign_recipients',
  'whatsapp_messages',
  'webhook_events',
  'oauth_states',
  'provider_status',
  'composer_drafts',
  'caption_templates',
  'hashtag_collections',
  'destination_groups',
  'publication_metric_snapshots',
  'scheduler_jobs',
  'app_user_sessions'
]);

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function migrationRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({ name: String(row.name ?? ''), checksum: String(row.checksum ?? '') }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function migrationsEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item.name === right[index].name && item.checksum === right[index].checksum);
}

function validateRowsJson(value) {
  if (typeof value !== 'string') throw maintenanceError('BACKUP_FORMAT_INVALID');
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw maintenanceError('BACKUP_FORMAT_INVALID');
  }
  if (!Array.isArray(parsed)) throw maintenanceError('BACKUP_FORMAT_INVALID');
  return value;
}

function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.driver !== 'postgres') throw maintenanceError('BACKUP_DATABASE_DRIVER_MISMATCH');
  if (!Array.isArray(snapshot.migrations) || !snapshot.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data)) {
    throw maintenanceError('BACKUP_FORMAT_INVALID');
  }
  const keys = Object.keys(snapshot.data);
  if (keys.length !== POSTGRES_BACKUP_TABLES.length || !POSTGRES_BACKUP_TABLES.every((table) => Object.hasOwn(snapshot.data, table))) {
    throw maintenanceError('BACKUP_FORMAT_INVALID');
  }
  const data = {};
  for (const table of POSTGRES_BACKUP_TABLES) data[table] = validateRowsJson(snapshot.data[table]);
  return { migrations: migrationRows(snapshot.migrations), data };
}

async function targetMigrations(executor) {
  const result = await executor.query('SELECT name, checksum FROM srocial_migrations ORDER BY name');
  return migrationRows(result.rows);
}

async function targetHasData(executor) {
  for (const table of POSTGRES_BACKUP_TABLES) {
    const result = await executor.query(`SELECT EXISTS (SELECT 1 FROM ${quoteIdentifier(table)} LIMIT 1) AS exists`);
    if (Boolean(result.rows?.[0]?.exists)) return true;
  }
  return false;
}

export function createPostgresBackupStore({ pool } = {}) {
  if (!pool || (typeof pool.query !== 'function' && typeof pool.connect !== 'function')) {
    throw maintenanceError('BACKUP_POSTGRES_POOL_REQUIRED');
  }

  return Object.freeze({
    driver: 'postgres',

    async exportSnapshot() {
      if (typeof pool.query !== 'function') throw maintenanceError('BACKUP_POSTGRES_POOL_REQUIRED');
      const migrations = await targetMigrations(pool);
      const data = {};
      for (const table of POSTGRES_BACKUP_TABLES) {
        const identifier = quoteIdentifier(table);
        const result = await pool.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb)::text AS rows_json FROM ${identifier} t`);
        data[table] = validateRowsJson(result.rows?.[0]?.rows_json ?? '[]');
      }
      return { driver: 'postgres', migrations, data };
    },

    async isEmpty() {
      if (typeof pool.query !== 'function') throw maintenanceError('BACKUP_POSTGRES_POOL_REQUIRED');
      return !(await targetHasData(pool));
    },

    async restoreSnapshot(snapshot, { force = false } = {}) {
      const validated = validateSnapshot(snapshot);
      if (typeof pool.connect !== 'function') throw maintenanceError('BACKUP_POSTGRES_POOL_REQUIRED');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const migrations = await targetMigrations(client);
        if (!migrationsEqual(validated.migrations, migrations)) throw maintenanceError('BACKUP_MIGRATION_MISMATCH');

        const hasData = await targetHasData(client);
        if (hasData && !force) throw maintenanceError('RESTORE_TARGET_NOT_EMPTY');

        if (force) {
          for (const table of [...POSTGRES_BACKUP_TABLES].reverse()) {
            await client.query(`DELETE FROM ${quoteIdentifier(table)}`);
          }
        }

        for (const table of POSTGRES_BACKUP_TABLES) {
          const rowsJson = validated.data[table];
          if (JSON.parse(rowsJson).length === 0) continue;
          const identifier = quoteIdentifier(table);
          await client.query(
            `INSERT INTO ${identifier} SELECT * FROM jsonb_populate_recordset(NULL::${identifier}, $1::jsonb)`,
            [rowsJson]
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* preserve original failure */ }
        throw error;
      } finally {
        client.release();
      }
    },

    async close() {}
  });
}
