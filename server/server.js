import { createServer } from 'node:http';
import { createRequestHandler } from './app.js';
import { createOAuthProviderRegistry } from './auth/oauth-provider-registry.js';
import { createTokenCipher } from './auth/token-crypto.js';
import { createRepositoryFromEnvironment } from './db/create-repository.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '127.0.0.1';
const repository = createRepositoryFromEnvironment();
await repository.initialize();

const oauthProviderRegistry = createOAuthProviderRegistry();
const tokenCipher = process.env.TOKEN_ENCRYPTION_KEY ? createTokenCipher(process.env.TOKEN_ENCRYPTION_KEY) : null;
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://${host}:${port}`;

const server = createServer(createRequestHandler({ repository, oauthProviderRegistry, tokenCipher, publicBaseUrl }));
server.listen(port, host, () => {
  console.log(`Srocial listening on http://${host}:${port}`);
});
