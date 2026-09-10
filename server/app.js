import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonBody, RequestBodyError } from './http/read-json-body.js';
import { createOAuthProviderRegistry } from './oauth/provider-registry.js';
import { disconnectAccountPayload, listAccountsPayload } from './routes/accounts.js';
import { getDashboardPayload } from './routes/dashboard.js';
import { getHealthPayload } from './routes/health.js';
import { buildOAuthSuccessLocation, completeOAuthRoute, oauthErrorPayload, startOAuthRoute } from './routes/oauth.js';
import { createPostPayload, listPostsPayload } from './routes/posts.js';

const CLIENT_ROOT = fileURLToPath(new URL('../client/', import.meta.url));
const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
});

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function sendRedirect(response, location) {
  response.writeHead(302, { location, 'cache-control': 'no-store' });
  response.end();
}

function safeClientPath(pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const normalized = normalize(requested);
  if (normalized.startsWith('..') || normalized.includes('../')) return null;
  return join(CLIENT_ROOT, normalized);
}

async function serveStatic(pathname, response) {
  const filePath = safeClientPath(pathname);
  if (!filePath) return false;
  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=300'
    });
    response.end(content);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR') return false;
    throw error;
  }
}

export function createRequestHandler({
  repository = null,
  now = () => new Date(),
  oauthProviders = createOAuthProviderRegistry(),
  env = process.env
} = {}) {
  return async function requestHandler(request, response) {
    try {
      const url = new URL(request.url, 'http://localhost');

      if (request.method === 'GET' && url.pathname === '/api/health') {
        sendJson(response, 200, getHealthPayload());
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/dashboard') {
        sendJson(response, 200, await getDashboardPayload(repository));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/accounts') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await listAccountsPayload(repository);
        return sendJson(response, result.statusCode, result.payload);
      }

      const accountMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)$/);
      if (request.method === 'DELETE' && accountMatch) {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await disconnectAccountPayload(repository, decodeURIComponent(accountMatch[1]));
        return sendJson(response, result.statusCode, result.payload);
      }

      const oauthMatch = url.pathname.match(/^\/auth\/([^/]+)\/(start|callback)$/);
      if (request.method === 'GET' && oauthMatch) {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const providerName = decodeURIComponent(oauthMatch[1]);
        try {
          if (oauthMatch[2] === 'start') {
            const result = await startOAuthRoute({
              repository,
              providers: oauthProviders,
              providerName,
              returnTo: url.searchParams.get('returnTo') ?? '/',
              env,
              now: now()
            });
            if (url.searchParams.get('mode') === 'json') return sendJson(response, 200, result);
            return sendRedirect(response, result.authorizationUrl);
          }

          const result = await completeOAuthRoute({
            repository,
            providers: oauthProviders,
            providerName,
            query: url.searchParams,
            env,
            now: now()
          });
          return sendRedirect(response, buildOAuthSuccessLocation(result.returnTo, result.account.platform));
        } catch (error) {
          const mapped = oauthErrorPayload(error);
          if (mapped) return sendJson(response, mapped.statusCode, mapped.payload);
          throw error;
        }
      }

      if (request.method === 'GET' && url.pathname === '/api/posts') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await listPostsPayload(repository);
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method === 'POST' && url.pathname === '/api/posts') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const body = await readJsonBody(request);
        const result = await createPostPayload(repository, body, { now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendJson(response, 405, { error: 'method_not_allowed' });
        return;
      }

      if (await serveStatic(url.pathname, response)) return;
      sendJson(response, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof RequestBodyError) return sendJson(response, error.statusCode, { error: error.code });
      console.error('Request failed', error);
      return sendJson(response, 500, { error: 'internal_error' });
    }
  };
}
