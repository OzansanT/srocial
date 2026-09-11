import pg from 'pg';

const { Pool } = pg;

export function createPostgresRepository({ connectionString, pool = null } = {}) {
  const url = String(connectionString ?? '').trim();
  if (!pool && !url) throw new Error('DATABASE_URL_REQUIRED');
  const database = pool ?? new Pool({ connectionString: url });
  const ownsPool = !pool;

  return {
    async initialize() {},
    async healthCheck() {
      return { ok: true, backend: 'postgres' };
    },
    async close() {
      if (ownsPool) await database.end();
    }
  };
}
