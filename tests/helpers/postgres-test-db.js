import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const migrationsDirectory = fileURLToPath(new URL('../../server/db/migrations/', import.meta.url));

function validateSchemaName(schema) {
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error('INVALID_TEST_SCHEMA');
  return schema;
}

export function postgresTestUrl() {
  return String(process.env.TEST_POSTGRES_URL ?? '').trim();
}

export function hasPostgresTestDatabase() {
  return Boolean(postgresTestUrl());
}

export async function preparePostgresTestSchema(schema) {
  const connectionString = postgresTestUrl();
  if (!connectionString) throw new Error('TEST_POSTGRES_URL_REQUIRED');
  const safeSchema = validateSchemaName(schema);
  const admin = new Pool({ connectionString });
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${safeSchema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${safeSchema}`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString, options: `-c search_path=${safeSchema}` });
  const files = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();
  for (const name of files) {
    await pool.query(await readFile(`${migrationsDirectory}${name}`, 'utf8'));
  }
  return pool;
}

export async function clearPostgresRuntimeTables(pool) {
  await pool.query('TRUNCATE TABLE scheduler_jobs, publications, media, posts, oauth_states, accounts RESTART IDENTITY CASCADE');
}

export async function dropPostgresTestSchema(schema) {
  const connectionString = postgresTestUrl();
  if (!connectionString) return;
  const safeSchema = validateSchemaName(schema);
  const admin = new Pool({ connectionString });
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${safeSchema} CASCADE`);
  } finally {
    await admin.end();
  }
}
