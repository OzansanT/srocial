import { createServer } from 'node:http';
import { createRequestHandler } from './app.js';
import { createAppAuth } from './auth/create-app-auth.js';
import { createOAuthProviderRegistry } from './auth/oauth-provider-registry.js';
import { createTokenCipher } from './auth/token-crypto.js';
import { createRepositoryFromEnvironment } from './db/create-repository.js';
import { createMediaStoreFromEnvironment } from './media/create-media-store.js';
import { registerFacebookProvider } from './platforms/facebook/index.js';
import { registerInstagramProvider } from './platforms/instagram/index.js';
import { createPlatformRegistry } from './platforms/registry.js';
import { registerThreadsProvider } from './platforms/threads/index.js';
import { runSchedulerTick } from './scheduler/run-scheduler-tick.js';
import { startMediaRetentionLoop } from './scheduler/start-media-retention-loop.js';
import { startSchedulerLoop } from './scheduler/start-scheduler-loop.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '127.0.0.1';
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://${host}:${port}`;
const runtimeEnv = { ...process.env, PUBLIC_BASE_URL: publicBaseUrl };
const appAuth = createAppAuth({ env: runtimeEnv });
const repository = createRepositoryFromEnvironment();
await repository.initialize();

const oauthProviderRegistry = createOAuthProviderRegistry();
const platformRegistry = createPlatformRegistry();
const tokenCipher = process.env.TOKEN_ENCRYPTION_KEY ? createTokenCipher(process.env.TOKEN_ENCRYPTION_KEY) : null;
const mediaStore = createMediaStoreFromEnvironment({ env: runtimeEnv });
await mediaStore.initialize();

registerInstagramProvider({ env: process.env, oauthRegistry: oauthProviderRegistry, platformRegistry, repository, cipher: tokenCipher });
registerFacebookProvider({ env: process.env, oauthRegistry: oauthProviderRegistry, platformRegistry, repository, cipher: tokenCipher });
registerThreadsProvider({ env: process.env, oauthRegistry: oauthProviderRegistry, platformRegistry, repository, cipher: tokenCipher });

const schedulerLoop = startSchedulerLoop({
  enabled: process.env.SCHEDULER_ENABLED,
  allowRealPublish: process.env.ALLOW_REAL_PUBLISH,
  repository,
  registry: platformRegistry,
  oauthRegistry: oauthProviderRegistry,
  tokenCipher,
  intervalMs: process.env.SCHEDULER_INTERVAL_MS,
  tick: runSchedulerTick
});

const mediaRetentionLoop = startMediaRetentionLoop({
  enabled: process.env.MEDIA_ORPHAN_CLEANUP_ENABLED,
  repository,
  mediaStore,
  retentionMs: process.env.MEDIA_ORPHAN_RETENTION_MS,
  intervalMs: process.env.MEDIA_ORPHAN_CLEANUP_INTERVAL_MS,
  maxDeletes: process.env.MEDIA_ORPHAN_CLEANUP_MAX_DELETES
});

const server = createServer(createRequestHandler({ repository, oauthProviderRegistry, tokenCipher, publicBaseUrl, mediaStore, appAuth }));
server.listen(port, host, () => { console.log(`Srocial listening on http://${host}:${port}`); });

let shuttingDown = false;
async function closeRepository() {
  try {
    await repository.close?.();
  } catch (error) {
    console.error('Srocial repository shutdown failed', { code: error?.code ?? 'REPOSITORY_CLOSE_ERROR' });
    process.exitCode = 1;
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  schedulerLoop.stop();
  mediaRetentionLoop.stop();
  server.close(async (error) => {
    if (error) {
      console.error('Srocial shutdown failed', { code: error?.code ?? 'SERVER_CLOSE_ERROR' });
      process.exitCode = 1;
    }
    await closeRepository();
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
