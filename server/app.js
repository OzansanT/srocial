import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonBody, RequestBodyError } from './http/read-json-body.js';
import { getHealthPayload } from './routes/health.js';
import { getDashboardPayload } from './routes/dashboard.js';
import { createPostPayload, listPostsPayload } from './routes/posts.js';
import { disconnectAccountPayload, listAccountsPayload } from './routes/accounts.js';
import { completeOAuthPayload, startOAuthPayload } from './routes/oauth.js';

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

export function createRequestHandler({ repository = null, now = () => new Date(), oauthProviderRegistry = new Map(), tokenCipher = null, publicBaseUrl = 'http://127.0.0.1:3000' } = {}) {
  return async function requestHandler(request, response) {
    try {
      const url = new URL(request.url, 'http://localhost');

      if (request.method === 'GET' && url.pathname === '/api/health') return sendJson(response, 200, getHealthPayload());
      if (request.method === 'GET' && url.pathname === '/api/dashboard') return sendJson(response, 200, await getDashboardPayload(repository));

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

      if (request.method === 'GET' && url.pathname === '/api/accounts') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await listAccountsPayload(repository);
        return sendJson(response, result.statusCode, result.payload);
      }

      const disconnect = url.pathname.match(/^\/api\/accounts\/([^/]+)\/disconnect$/);
      if (request.method === 'POST' && disconnect) {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await disconnectAccountPayload(repository, decodeURIComponent(disconnect[1]), { now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      const oauthStart = url.pathname.match(/^\/api\/oauth\/([^/]+)\/start$/);
      if (request.method === 'POST' && oauthStart) {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const body = await readJsonBody(request);
        const result = await startOAuthPayload({ provider: decodeURIComponent(oauthStart[1]), redirectUri: body.redirectUri, repository, providerRegistry: oauthProviderRegistry, publicBaseUrl, now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      const oauthCallback = url.pathname.match(/^\/api\/oauth\/([^/]+)\/callback$/);
      if (request.method === 'GET' && oauthCallback) {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        if (!tokenCipher) return sendJson(response, 503, { error: 'oauth_not_configured' });
        const result = await completeOAuthPayload({ provider: decodeURIComponent(oauthCallback[1]), code: url.searchParams.get('code'), state: url.searchParams.get('state'), repository, providerRegistry: oauthProviderRegistry, cipher: tokenCipher, now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'method_not_allowed' });
      if (await serveStatic(url.pathname, response)) return;
      return sendJson(response, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof RequestBodyError) return sendJson(response, error.statusCode, { error: error.code });
      console.error('Request failed', error);
      return sendJson(response, 500, { error: 'internal_error' });
    }
  };
}
