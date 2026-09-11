import { createServer } from 'node:http';
import { createRequestHandler } from './app.js';
import { createOAuthProviderRegistry } from './auth/oauth-provider-registry.js';
import { createTokenCipher } from './auth/token-crypto.js';
import { createRepositoryFromEnvironment } from './db/create-repository.js';
import { createLocalMediaStore } from './media/local-media-store.js';
import { createPlatformRegistry } from './platforms/registry.js';
import { registerInstagramProvider } from './platforms/instagram/index.js';
import { runSchedulerTick } from './scheduler/run-scheduler-tick.js';
import { startSchedulerLoop } from './scheduler/start-scheduler-loop.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '127.0.0.1';
const repository = createRepositoryFromEnvironment();
await repository.initialize();

const oauthProviderRegistry = createOAuthProviderRegistry();
const platformRegistry = createPlatformRegistry();
const tokenCipher = process.env.TOKEN_ENCRYPTION_KEY ? createTokenCipher(process.env.TOKEN_ENCRYPTION_KEY) : null;
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://${host}:${port}`;
const mediaStore = createLocalMediaStore({
  rootDirectory: process.env.MEDIA_UPLOAD_DIR ?? './data/uploads',
  publicBaseUrl,
  maxBytes: process.env.MEDIA_UPLOAD_MAX_BYTES ?? '52428800',
  totalMaxBytes: process.env.MEDIA_UPLOAD_TOTAL_MAX_BYTES ?? '5368709120'
});
await mediaStore.initialize();

registerInstagramProvider({ env: process.env, oauthRegistry: oauthProviderRegistry, platformRegistry, repository, cipher: tokenCipher });

const schedulerLoop = startSchedulerLoop({
  enabled: process.env.SCHEDULER_ENABLED,
  allowRealPublish: process.env.ALLOW_REAL_PUBLISH,
  repository,
  registry: platformRegistry,
  intervalMs: process.env.SCHEDULER_INTERVAL_MS,
  tick: runSchedulerTick
});

const server = createServer(createRequestHandler({ repository, oauthProviderRegistry, tokenCipher, publicBaseUrl, mediaStore }));
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
