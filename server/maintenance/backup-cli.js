import { resolve } from 'node:path';
import { createMediaStoreFromEnvironment } from '../media/create-media-store.js';
import { createBackup } from './create-backup.js';
import { createDatabaseBackupStoreFromEnvironment, mediaDriverFromEnvironment } from './create-database-backup-store.js';
import { parseBackupArgs } from './cli-args.js';

async function main() {
  const { output } = parseBackupArgs(process.argv.slice(2));
  const databaseStore = createDatabaseBackupStoreFromEnvironment(process.env);
  const mediaStore = createMediaStoreFromEnvironment({ env: process.env });
  try {
    await mediaStore.initialize();
    const result = await createBackup({
      outputDirectory: resolve(output),
      databaseStore,
      databaseDriver: databaseStore.driver,
      mediaStore,
      mediaDriver: mediaDriverFromEnvironment(process.env)
    });
    console.log(`Backup created: ${result.outputDirectory} (${result.mediaCount} media files)`);
  } finally {
    await databaseStore.close();
  }
}

main().catch((error) => {
  console.error(error?.code ?? 'BACKUP_FAILED');
  process.exitCode = 1;
});
