import { createReadStream } from 'node:fs';
import { readManifest, validateBackupFiles } from './backup-format.js';
import { maintenanceError } from './errors.js';

function sameJson(left, right) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

export async function restoreBackup({
  inputDirectory,
  databaseStore,
  databaseDriver,
  mediaStore,
  mediaDriver,
  force = false
} = {}) {
  const input = String(inputDirectory ?? '').trim();
  if (!input) throw maintenanceError('BACKUP_INPUT_REQUIRED');
  if (!databaseStore || typeof databaseStore.restoreSnapshot !== 'function' || typeof databaseStore.isEmpty !== 'function') {
    throw maintenanceError('BACKUP_DATABASE_STORE_REQUIRED');
  }
  if (!mediaStore || typeof mediaStore.list !== 'function' || typeof mediaStore.restore !== 'function' || typeof mediaStore.remove !== 'function') {
    throw maintenanceError('BACKUP_MEDIA_STORE_REQUIRED');
  }

  const manifest = await readManifest(input);
  if (manifest.database.driver !== databaseDriver) throw maintenanceError('BACKUP_DATABASE_DRIVER_MISMATCH');
  if (manifest.media.driver !== mediaDriver) throw maintenanceError('BACKUP_MEDIA_DRIVER_MISMATCH');

  const { databaseSnapshot, mediaDirectory } = await validateBackupFiles(input, manifest);
  if (!databaseSnapshot || databaseSnapshot.driver !== manifest.database.driver || !sameJson(databaseSnapshot.migrations, manifest.database.migrations)) {
    throw maintenanceError('BACKUP_FORMAT_INVALID');
  }

  const existingMedia = await mediaStore.list();
  const databaseEmpty = await databaseStore.isEmpty();
  if (!force && (!databaseEmpty || existingMedia.length > 0)) throw maintenanceError('RESTORE_TARGET_NOT_EMPTY');

  await databaseStore.restoreSnapshot(databaseSnapshot, { force });

  if (force) {
    for (const asset of existingMedia) await mediaStore.remove(asset.key);
  }

  for (const asset of manifest.media.assets) {
    await mediaStore.restore(
      asset.key,
      createReadStream(`${mediaDirectory}/${asset.key}`),
      { contentType: asset.contentType }
    );
  }

  return {
    inputDirectory: input,
    mediaCount: manifest.media.assets.length,
    createdAt: manifest.createdAt
  };
}
