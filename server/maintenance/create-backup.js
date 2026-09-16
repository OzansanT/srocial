import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { mediaMetadataFromKey } from '../media/media-format.js';
import { BACKUP_FORMAT, BACKUP_VERSION, sha256Bytes } from './backup-format.js';
import { maintenanceError } from './errors.js';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function copyReadableToFile(readable, filePath) {
  const hash = createHash('sha256');
  const handle = await open(filePath, 'wx');
  let size = 0;
  let completed = false;
  try {
    for await (const chunk of readable) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      hash.update(bytes);
      let offset = 0;
      while (offset < bytes.length) {
        const result = await handle.write(bytes, offset, bytes.length - offset);
        if (!result.bytesWritten) throw maintenanceError('BACKUP_WRITE_FAILED');
        offset += result.bytesWritten;
      }
    }
    completed = true;
    return { size, sha256: hash.digest('hex') };
  } finally {
    try { await handle.close(); } catch { /* cleanup below */ }
    if (!completed) {
      try { await rm(filePath, { force: true }); } catch { /* preserve original error */ }
    }
  }
}

export async function createBackup({
  outputDirectory,
  databaseStore,
  databaseDriver,
  mediaStore,
  mediaDriver,
  now = () => new Date()
} = {}) {
  const output = String(outputDirectory ?? '').trim();
  if (!output) throw maintenanceError('BACKUP_OUTPUT_REQUIRED');
  if (!databaseStore || typeof databaseStore.exportSnapshot !== 'function') throw maintenanceError('BACKUP_DATABASE_STORE_REQUIRED');
  if (!mediaStore || typeof mediaStore.list !== 'function' || typeof mediaStore.open !== 'function') throw maintenanceError('BACKUP_MEDIA_STORE_REQUIRED');
  if (await exists(output)) throw maintenanceError('BACKUP_OUTPUT_EXISTS');

  const parent = dirname(output);
  const temporary = join(parent, `.${basename(output)}.tmp-${randomUUID()}`);
  let completed = false;
  try {
    await mkdir(parent, { recursive: true });
    await mkdir(temporary, { recursive: false });
    await mkdir(join(temporary, 'media'));

    const snapshot = await databaseStore.exportSnapshot();
    if (!snapshot || snapshot.driver !== databaseDriver) throw maintenanceError('BACKUP_DATABASE_DRIVER_MISMATCH');
    const databaseBytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    await writeFile(join(temporary, 'database.json'), databaseBytes, { flag: 'wx' });

    const listed = await mediaStore.list();
    const assets = [...listed].sort((left, right) => String(left.key).localeCompare(String(right.key)));
    const mediaManifest = [];
    for (const asset of assets) {
      const key = String(asset?.key ?? '');
      if (!mediaMetadataFromKey(key)) throw maintenanceError('BACKUP_FORMAT_INVALID');
      const opened = await mediaStore.open(key);
      const copied = await copyReadableToFile(opened.stream, join(temporary, 'media', key));
      if (Number.isSafeInteger(opened.size) && opened.size !== copied.size) throw maintenanceError('BACKUP_MEDIA_SIZE_MISMATCH');
      mediaManifest.push({
        key,
        contentType: opened.contentType,
        size: copied.size,
        sha256: copied.sha256
      });
    }

    const createdAt = now();
    if (!(createdAt instanceof Date) || Number.isNaN(createdAt.getTime())) throw maintenanceError('BACKUP_FORMAT_INVALID');
    const manifest = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: createdAt.toISOString(),
      database: {
        driver: databaseDriver,
        file: 'database.json',
        sha256: sha256Bytes(databaseBytes),
        migrations: Array.isArray(snapshot.migrations) ? structuredClone(snapshot.migrations) : []
      },
      media: {
        driver: mediaDriver,
        directory: 'media',
        assets: mediaManifest
      }
    };
    await writeFile(join(temporary, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });

    if (await exists(output)) throw maintenanceError('BACKUP_OUTPUT_EXISTS');
    await rename(temporary, output);
    completed = true;
    return { outputDirectory: output, mediaCount: mediaManifest.length, createdAt: manifest.createdAt };
  } finally {
    if (!completed) {
      try { await rm(temporary, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
}
