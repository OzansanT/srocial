import { resolve } from 'node:path';
import pg from 'pg';
import { createJsonBackupStore } from './json-backup-store.js';
import { createPostgresBackupStore } from './postgres-backup-store.js';
import { maintenanceError } from './errors.js';

const { Pool } = pg;

export function createDatabaseBackupStoreFromEnvironment(env = process.env) {
  const driver = String(env.DATABASE_DRIVER ?? 'json').trim().toLowerCase();
  if (driver === 'json') {
    return createJsonBackupStore({ filePath: resolve(env.DATA_FILE ?? './data/srocial.json') });
  }
  if (driver !== 'postgres') throw maintenanceError('DATABASE_DRIVER_UNSUPPORTED');

  const connectionString = String(env.DATABASE_URL ?? '').trim();
  if (!connectionString) throw maintenanceError('DATABASE_URL_REQUIRED');
  const pool = new Pool({ connectionString });
  const store = createPostgresBackupStore({ pool });
  return Object.freeze({
    ...store,
    async close() {
      await pool.end();
    }
  });
}

export function mediaDriverFromEnvironment(env = process.env) {
  const driver = String(env.MEDIA_STORAGE_DRIVER ?? 'local').trim().toLowerCase();
  if (!['local', 's3'].includes(driver)) throw maintenanceError('MEDIA_STORAGE_DRIVER_UNSUPPORTED');
  return driver;
}
