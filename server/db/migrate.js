import { runMigrations } from './migration-runner.js';

function safeMigrationError(error) {
  const message = String(error?.message ?? '');
  if (message === 'DATABASE_URL_REQUIRED') return message;
  if (message.startsWith('MIGRATION_CHECKSUM_MISMATCH:')) return message;
  return 'DATABASE_MIGRATION_FAILED';
}

try {
  const results = await runMigrations({ connectionString: process.env.DATABASE_URL });
  for (const result of results) console.log(`${result.status}: ${result.name}`);
} catch (error) {
  console.error(safeMigrationError(error));
  process.exitCode = 1;
}
