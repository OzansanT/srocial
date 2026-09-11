import { resolve } from 'node:path';
import { createJsonRepository } from './json-repository.js';
import { createPostgresRepository } from './postgres-repository.js';

export function createRepositoryFromEnvironment(env = process.env) {
  const driver = String(env.DATABASE_DRIVER ?? 'json').trim().toLowerCase();

  if (driver === 'json') {
    const filePath = resolve(env.DATA_FILE ?? './data/srocial.json');
    return createJsonRepository({ filePath });
  }

  if (driver === 'postgres') {
    const connectionString = String(env.DATABASE_URL ?? '').trim();
    if (!connectionString) throw new Error('DATABASE_URL_REQUIRED');
    return createPostgresRepository({ connectionString });
  }

  throw new Error('DATABASE_DRIVER_UNSUPPORTED');
}
