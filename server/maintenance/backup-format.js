import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { mediaMetadataFromKey } from '../media/media-format.js';
import { maintenanceError } from './errors.js';

export const BACKUP_FORMAT = 'srocial-backup';
export const BACKUP_VERSION = 1;

export function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function sha256File(filePath) {
  const hash = createHash('sha256');
  let size = 0;
  try {
    for await (const chunk of createReadStream(filePath)) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      hash.update(bytes);
    }
  } catch {
    throw maintenanceError('BACKUP_FORMAT_INVALID');
  }
  return { sha256: hash.digest('hex'), size };
}

function isHexSha256(value) {
  return /^[0-9a-f]{64}$/i.test(String(value ?? ''));
}

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw maintenanceError('BACKUP_FORMAT_INVALID');
  if (manifest.format !== BACKUP_FORMAT) throw maintenanceError('BACKUP_FORMAT_INVALID');
  if (manifest.version !== BACKUP_VERSION) throw maintenanceError('BACKUP_VERSION_UNSUPPORTED');
  if (!Number.isFinite(Date.parse(manifest.createdAt ?? ''))) throw maintenanceError('BACKUP_FORMAT_INVALID');

  const database = manifest.database;
  if (!database || !['json', 'postgres'].includes(database.driver) || database.file !== 'database.json' || !isHexSha256(database.sha256) || !Array.isArray(database.migrations)) {
    throw maintenanceError('BACKUP_FORMAT_INVALID');
  }

  const media = manifest.media;
  if (!media || !['local', 's3'].includes(media.driver) || media.directory !== 'media' || !Array.isArray(media.assets)) {
    throw maintenanceError('BACKUP_FORMAT_INVALID');
  }
  const keys = new Set();
  for (const asset of media.assets) {
    if (!asset || typeof asset !== 'object' || !mediaMetadataFromKey(asset.key) || keys.has(asset.key)) throw maintenanceError('BACKUP_FORMAT_INVALID');
    if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(asset.contentType)) throw maintenanceError('BACKUP_FORMAT_INVALID');
    if (!Number.isSafeInteger(asset.size) || asset.size < 0 || !isHexSha256(asset.sha256)) throw maintenanceError('BACKUP_FORMAT_INVALID');
    keys.add(asset.key);
  }
  return manifest;
}

export async function readManifest(inputDirectory) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(join(inputDirectory, 'manifest.json'), 'utf8'));
  } catch (error) {
    if (error?.code === 'BACKUP_VERSION_UNSUPPORTED' || error?.code === 'BACKUP_FORMAT_INVALID') throw error;
    throw maintenanceError('BACKUP_FORMAT_INVALID');
  }
  return validateManifest(parsed);
}

export async function validateBackupFiles(inputDirectory, manifest) {
  const databasePath = join(inputDirectory, manifest.database.file);
  const databaseDigest = await sha256File(databasePath);
  if (databaseDigest.sha256 !== manifest.database.sha256) throw maintenanceError('BACKUP_DATABASE_CHECKSUM_MISMATCH');

  let databaseSnapshot;
  try {
    databaseSnapshot = JSON.parse(await readFile(databasePath, 'utf8'));
  } catch {
    throw maintenanceError('BACKUP_FORMAT_INVALID');
  }

  const mediaDirectory = join(inputDirectory, manifest.media.directory);
  let entries;
  try {
    entries = await readdir(mediaDirectory, { withFileTypes: true });
  } catch {
    throw maintenanceError('BACKUP_MEDIA_SET_MISMATCH');
  }
  const actual = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  if (entries.some((entry) => !entry.isFile())) throw maintenanceError('BACKUP_MEDIA_SET_MISMATCH');
  const expected = manifest.media.assets.map((asset) => asset.key).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw maintenanceError('BACKUP_MEDIA_SET_MISMATCH');

  for (const asset of manifest.media.assets) {
    const mediaPath = join(mediaDirectory, asset.key);
    let fileStat;
    try {
      fileStat = await stat(mediaPath);
    } catch {
      throw maintenanceError('BACKUP_MEDIA_SET_MISMATCH');
    }
    if (!fileStat.isFile() || fileStat.size !== asset.size) throw maintenanceError('BACKUP_MEDIA_SIZE_MISMATCH');
    const digest = await sha256File(mediaPath);
    if (digest.size !== asset.size) throw maintenanceError('BACKUP_MEDIA_SIZE_MISMATCH');
    if (digest.sha256 !== asset.sha256) throw maintenanceError('BACKUP_MEDIA_CHECKSUM_MISMATCH');
  }

  return { databaseSnapshot, mediaDirectory };
}
