import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { maintenanceError } from './errors.js';

export const JSON_BACKUP_COLLECTIONS = Object.freeze([
  'posts',
  'publications',
  'jobs',
  'accounts',
  'oauthStates',
  'media',
  'publicationAttempts',
  'webhookEvents',
  'providerStatuses',
  'publicationMetricSnapshots',
  'contacts',
  'whatsappTemplates',
  'campaigns',
  'campaignRecipients',
  'whatsappMessages',
  'composerDrafts',
  'captionTemplates',
  'hashtagCollections',
  'destinationGroups',
  'users',
  'userSessions'
]);

function emptyData() {
  return Object.fromEntries(JSON_BACKUP_COLLECTIONS.map((name) => [name, []]));
}

function normalizeData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw maintenanceError('BACKUP_FORMAT_INVALID');
  for (const key of Object.keys(value)) {
    if (!JSON_BACKUP_COLLECTIONS.includes(key) || !Array.isArray(value[key])) throw maintenanceError('BACKUP_FORMAT_INVALID');
  }
  const normalized = emptyData();
  for (const name of JSON_BACKUP_COLLECTIONS) {
    if (Object.hasOwn(value, name)) {
      if (!Array.isArray(value[name])) throw maintenanceError('BACKUP_FORMAT_INVALID');
      normalized[name] = structuredClone(value[name]);
    }
  }
  return normalized;
}

async function readState(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    return normalizeData(parsed);
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyData();
    if (error?.code === 'BACKUP_FORMAT_INVALID') throw error;
    if (error instanceof SyntaxError) throw maintenanceError('BACKUP_FORMAT_INVALID');
    throw error;
  }
}

async function persistState(filePath, data) {
  const temporaryPath = `${filePath}.restore.tmp`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.driver !== 'json') throw maintenanceError('BACKUP_DATABASE_DRIVER_MISMATCH');
  if (!Array.isArray(snapshot.migrations)) throw maintenanceError('BACKUP_FORMAT_INVALID');
  return normalizeData(snapshot.data);
}

export function createJsonBackupStore({ filePath } = {}) {
  const target = String(filePath ?? '').trim();
  if (!target) throw maintenanceError('BACKUP_JSON_FILE_REQUIRED');

  return Object.freeze({
    driver: 'json',

    async exportSnapshot() {
      return {
        driver: 'json',
        migrations: [],
        data: await readState(target)
      };
    },

    async isEmpty() {
      const data = await readState(target);
      return JSON_BACKUP_COLLECTIONS.every((name) => data[name].length === 0);
    },

    async restoreSnapshot(snapshot, { force = false } = {}) {
      const restored = validateSnapshot(snapshot);
      if (!force && !(await this.isEmpty())) throw maintenanceError('RESTORE_TARGET_NOT_EMPTY');
      await persistState(target, restored);
    },

    async close() {}
  });
}
