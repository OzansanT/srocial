import { resolve } from 'node:path';
import { createMediaStoreFromEnvironment } from '../media/create-media-store.js';
import { parseRestoreArgs } from './cli-args.js';
import { createDatabaseBackupStoreFromEnvironment, mediaDriverFromEnvironment } from './create-database-backup-store.js';
import { restoreBackup } from './restore-backup.js';

async function main() {
  const { input, force } = parseRestoreArgs(process.argv.slice(2));
  const databaseStore = createDatabaseBackupStoreFromEnvironment(process.env);
  const mediaStore = createMediaStoreFromEnvironment({ env: process.env });
  try {
    await mediaStore.initialize();
    const result = await restoreBackup({
      inputDirectory: resolve(input),
      databaseStore,
      databaseDriver: databaseStore.driver,
      mediaStore,
      mediaDriver: mediaDriverFromEnvironment(process.env),
      force
    });
    console.log(`Backup restored: ${result.inputDirectory} (${result.mediaCount} media files)`);
  } finally {
    await databaseStore.close();
  }
}

main().catch((error) => {
  console.error(error?.code ?? 'RESTORE_FAILED');
  process.exitCode = 1;
});
