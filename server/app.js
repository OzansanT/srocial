import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonBody, RequestBodyError } from './http/read-json-body.js';
import { readRawBody } from './http/read-raw-body.js';
import { getHealthPayload } from './routes/health.js';
import { getDashboardPayload } from './routes/dashboard.js';
import { getAnalyticsPayload, refreshAnalyticsPayload, refreshPublicationAnalyticsPayload } from './routes/analytics.js';
import { routeComposerWorkflowRequest } from './routes/composer-workflows.js';
import {
  bulkCancelPostsPayload,
  bulkReschedulePostsPayload,
  cancelPostPayload,
  createPostPayload,
  duplicatePostPayload,
  listPostsPayload,
  retryPublicationPayload,
  updatePostPayload
} from './routes/posts.js';
import { disconnectAccountPayload, listAccountsPayload } from './routes/accounts.js';
import { completeOAuthPayload, startOAuthPayload } from './routes/oauth.js';
import { deleteMediaPayload, listMediaPayload } from './routes/media.js';
import { getTikTokCreatorInfoPayload } from './routes/tiktok.js';
import { getOperationsPayload } from './routes/operations.js';
import {
  handleMetaChallenge,
  handleMetaWebhook,
  handleTikTokWebhook,
  handleWhatsAppChallenge,
  handleWhatsAppWebhook
} from './routes/webhooks.js';
import {
  createWhatsAppCampaignPayload,
  createWhatsAppContactPayload,
  listWhatsAppCampaignsPayload,
  listWhatsAppContactsPayload,
  listWhatsAppTemplatesPayload,
  setWhatsAppConsentPayload,
  syncWhatsAppTemplatesPayload
} from './routes/whatsapp.js';
import { createAnalyticsService } from './services/analytics-service.js';

const CLIENT_ROOT = fileURLToPath(new URL('../client/', import.meta.url));
const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
});
const SAFE_OAUTH_ERROR_CODES = new Set([
  'oauth_code_required',
  'oauth_state_invalid',
  'oauth_state_provider_mismatch',
  'oauth_provider_error',
  'oauth_not_configured'
]);
const MEDIA_ERROR_RESPONSES = Object.freeze({
  UNSUPPORTED_MEDIA_TYPE: { statusCode: 415, error: 'unsupported_media_type' },
  MEDIA_SIGNATURE_MISMATCH: { statusCode: 415, error: 'media_signature_mismatch' },
  INVALID_MEDIA_SIGNATURE: { statusCode: 415, error: 'invalid_media_signature' },
  EMPTY_MEDIA: { statusCode: 400, error: 'empty_media' },
  MEDIA_TOO_LARGE: { statusCode: 413, error: 'media_too_large' },
  MEDIA_STORAGE_QUOTA_EXCEEDED: { statusCode: 507, error: 'media_storage_quota_exceeded' },
  MEDIA_NOT_FOUND: { statusCode: 404, error: 'not_found' }
});
const PUBLIC_AUTH_ASSETS = new Set([
  '/login.html',
  '/css/pages/login.css',
  '/js/api/client.js',
  '/js/api/auth-api.js',
  '/js/pages/login.js'
]);
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  response.end(String(payload ?? ''));
}

function sendNoContent(response) {
  response.writeHead(204, { 'cache-control': 'no-store' });
  response.end();
}

function sendRedirect(response, location) {
  response.writeHead(303, { location, 'cache-control': 'no-store' });
  response.end();
}

function requestPrefersHtml(request) {
  const accept = String(request.headers.accept ?? '').toLowerCase();
  return accept.includes('text/html') && !accept.includes('application/json');
}

function oauthDashboardLocation(provider, { status, code = null }) {
  const params = new URLSearchParams({
    oauth: String(provider ?? '').trim().toLowerCase(),
    status: status === 'connected' ? 'connected' : 'error'
  });
  if (status !== 'connected') {
    const safeCode = SAFE_OAUTH_ERROR_CODES.has(code) ? code : 'oauth_provider_error';
    params.set('code', safeCode);
  }
  return `/?${params.toString()}#accounts`;
}

function mediaErrorResponse(error) {
  return MEDIA_ERROR_RESPONSES[error?.code] ?? null;
}

function decodeMediaKey(value) {
  try { return decodeURIComponent(value); } catch { return null; }
}

function safeClientPath(pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const normalized = normalize(requested);
  if (normalized.startsWith('..') || normalized.includes('../')) return null;
  return join(CLIENT_ROOT, normalized);
}

function isApiRequest(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function isMutation(method) {
  return MUTATION_METHODS.has(String(method ?? '').toUpperCase());
}

function isPublicRoute(method, pathname) {
  const normalizedMethod = String(method ?? 'GET').toUpperCase();
  if (normalizedMethod === 'GET' && pathname === '/api/health') return true;
  if (normalizedMethod === 'POST' && pathname === '/api/auth/login') return true;
  if ((normalizedMethod === 'GET' || normalizedMethod === 'POST') && pathname === '/api/webhooks/meta') return true;
  if (normalizedMethod === 'POST' && pathname === '/api/webhooks/tiktok') return true;
  if ((normalizedMethod === 'GET' || normalizedMethod === 'POST') && pathname === '/api/webhooks/whatsapp') return true;
  if ((normalizedMethod === 'GET' || normalizedMethod === 'HEAD') && PUBLIC_AUTH_ASSETS.has(pathname)) return true;
  if (normalizedMethod === 'GET' && /^\/api\/oauth\/[^/]+\/callback$/.test(pathname)) return true;
  if ((normalizedMethod === 'GET' || normalizedMethod === 'HEAD') && /^\/media\/[^/]+$/.test(pathname)) return true;
  return false;
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
  oauthProviderRegistry = new Map(),
  platformRegistry = new Map(),
  analyticsRegistry = new Map(),
  tokenCipher = null,
  publicBaseUrl = 'http://127.0.0.1:3000',
  mediaStore = null,
  appAuth = null,
  webhookConfig = {},
  whatsappAdapter = null
} = {}) {
  const analyticsService = repository ? createAnalyticsService({ repository, analyticsRegistry }) : null;
  return async function requestHandler(request, response) {
    try {
      const url = new URL(request.url, 'http://localhost');

      if (request.method === 'POST' && url.pathname === '/api/auth/login' && appAuth) {
        const loginLimit = appAuth.consumeLogin(request);
        if (!loginLimit.allowed) {
          return sendJson(response, 429, { error: 'rate_limited' }, { 'retry-after': String(loginLimit.retryAfterSeconds) });
        }
        const body = await readJsonBody(request);
        const result = await appAuth.login(body);
        const headers = {};
        if (result.setCookie) headers['set-cookie'] = result.setCookie;
        return sendJson(response, result.statusCode, result.payload, headers);
      }

      let applicationSession = null;
      if (appAuth?.enabled && !isPublicRoute(request.method, url.pathname)) {
        applicationSession = await appAuth.readSession(request);
        if (!applicationSession) {
          if (isApiRequest(url.pathname)) return sendJson(response, 401, { error: 'unauthorized' });
          return sendRedirect(response, '/login.html');
        }

        if (isApiRequest(url.pathname)) {
          const limit = appAuth.consumeApi(request);
          if (!limit.allowed) {
            return sendJson(response, 429, { error: 'rate_limited' }, { 'retry-after': String(limit.retryAfterSeconds) });
          }
        }

        if (isMutation(request.method) && !appAuth.validateMutation(request)) {
          return sendJson(response, 403, { error: 'cross_site_request' });
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/webhooks/meta') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const rawBody = await readRawBody(request);
        const result = await handleMetaWebhook({ repository, rawBody, signature: request.headers['x-hub-signature-256'], appSecret: webhookConfig.metaAppSecret, now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method === 'GET' && url.pathname === '/api/webhooks/meta') {
        const result = handleMetaChallenge({ mode: url.searchParams.get('hub.mode'), verifyToken: url.searchParams.get('hub.verify_token'), challenge: url.searchParams.get('hub.challenge'), expectedToken: webhookConfig.metaVerifyToken });
        if (result.text != null) return sendText(response, result.statusCode, result.text);
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method === 'POST' && url.pathname === '/api/webhooks/tiktok') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const rawBody = await readRawBody(request);
        const result = await handleTikTokWebhook({ repository, rawBody, signature: request.headers['tiktok-signature'], clientSecret: webhookConfig.tiktokClientSecret, now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method === 'GET' && url.pathname === '/api/webhooks/whatsapp') {
        const result = handleWhatsAppChallenge({ mode: url.searchParams.get('hub.mode'), verifyToken: url.searchParams.get('hub.verify_token'), challenge: url.searchParams.get('hub.challenge'), expectedToken: webhookConfig.whatsappVerifyToken });
        if (result.text != null) return sendText(response, result.statusCode, result.text);
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method === 'POST' && url.pathname === '/api/webhooks/whatsapp') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const rawBody = await readRawBody(request);
        const result = await handleWhatsAppWebhook({ repository, rawBody, signature: request.headers['x-hub-signature-256'], appSecret: webhookConfig.whatsappAppSecret, now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method === 'GET' && url.pathname === '/api/auth/session' && appAuth) {
        if (!appAuth.enabled) return sendJson(response, 200, { authenticated: false });
        return sendJson(response, 200, { authenticated: true, user: applicationSession.user });
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/logout' && appAuth) {
        if (!appAuth.enabled) return sendJson(response, 200, { authenticated: false });
        const logout = await appAuth.logout(applicationSession);
        return sendJson(response, 200, { authenticated: false }, { 'set-cookie': logout.setCookie });
      }

      if (request.method === 'GET' && url.pathname === '/api/health') {
        const health = await getHealthPayload(repository);
        return sendJson(response, health.ok ? 200 : 503, health);
      }
      if (request.method === 'GET' && url.pathname === '/api/dashboard') return sendJson(response, 200, await getDashboardPayload(repository));
      if (request.method === 'GET' && url.pathname === '/api/operations') {
        const result = await getOperationsPayload(repository);
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method === 'GET' && url.pathname === '/api/analytics') {
        if (!analyticsService) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await getAnalyticsPayload(analyticsService, {
          platform: url.searchParams.get('platform'),
          accountId: url.searchParams.get('accountId'),
          from: url.searchParams.get('from'),
          until: url.searchParams.get('until')
        });
        return sendJson(response, result.statusCode, result.payload);
      }
      if (request.method === 'POST' && url.pathname === '/api/analytics/refresh') {
        if (!analyticsService) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await refreshAnalyticsPayload(analyticsService, await readJsonBody(request), { now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }
      const analyticsPublication = url.pathname.match(/^\/api\/analytics\/publications\/([^/]+)\/refresh$/);
      if (request.method === 'POST' && analyticsPublication) {
        if (!analyticsService) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await refreshPublicationAnalyticsPayload(analyticsService, decodeURIComponent(analyticsPublication[1]), { now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      const composerResult = await routeComposerWorkflowRequest({ request, pathname: url.pathname, repository, now: now() });
      if (composerResult) {
        if (composerResult.statusCode === 204) return sendNoContent(response);
        return sendJson(response, composerResult.statusCode, composerResult.payload);
      }

      if (request.method === 'GET' && url.pathname === '/api/whatsapp/contacts') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await listWhatsAppContactsPayload(repository);
        return sendJson(response, result.statusCode, result.payload);
      }
      if (request.method === 'POST' && url.pathname === '/api/whatsapp/contacts') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await createWhatsAppContactPayload(repository, await readJsonBody(request), { now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }
      const whatsappConsent = url.pathname.match(/^\/api\/whatsapp\/contacts\/([^/]+)\/consent$/);
      if (request.method === 'POST' && whatsappConsent) {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await setWhatsAppConsentPayload(repository, decodeURIComponent(whatsappConsent[1]), await readJsonBody(request), { now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }
      if (request.method === 'GET' && url.pathname === '/api/whatsapp/templates') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await listWhatsAppTemplatesPayload(repository);
        return sendJson(response, result.statusCode, result.payload);
      }
      if (request.method === 'POST' && url.pathname === '/api/whatsapp/templates/sync') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await syncWhatsAppTemplatesPayload(repository, whatsappAdapter, { now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }
      if (request.method === 'GET' && url.pathname === '/api/whatsapp/campaigns') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await listWhatsAppCampaignsPayload(repository);
        return sendJson(response, result.statusCode, result.payload);
      }
      if (request.method === 'POST' && url.pathname === '/api/whatsapp/campaigns') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await createWhatsAppCampaignPayload(repository, await readJsonBody(request), { now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method === 'GET' && url.pathname === '/api/media') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        if (!mediaStore) return sendJson(response, 503, { error: 'media_storage_unavailable' });
        const result = await listMediaPayload(repository, mediaStore);
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method === 'POST' && url.pathname === '/api/media/uploads') {
        if (!mediaStore) return sendJson(response, 503, { error: 'media_storage_unavailable' });
        try {
          const upload = await mediaStore.save(request, { contentType: request.headers['content-type'] });
          return sendJson(response, 201, { upload });
        } catch (error) {
          const mapped = mediaErrorResponse(error);
          if (mapped) return sendJson(response, mapped.statusCode, { error: mapped.error });
          throw error;
        }
      }

      const mediaApiMatch = url.pathname.match(/^\/api\/media\/([^/]+)$/);
      if (request.method === 'DELETE' && mediaApiMatch) {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        if (!mediaStore) return sendJson(response, 503, { error: 'media_storage_unavailable' });
        const key = decodeMediaKey(mediaApiMatch[1]);
        if (!key) return sendJson(response, 404, { error: 'not_found' });
        try {
          const result = await deleteMediaPayload(repository, mediaStore, key);
          if (result.statusCode === 204) return sendNoContent(response);
          return sendJson(response, result.statusCode, result.payload);
        } catch (error) {
          const mapped = mediaErrorResponse(error);
          if (mapped) return sendJson(response, mapped.statusCode, { error: mapped.error });
          throw error;
        }
      }

      const mediaMatch = url.pathname.match(/^\/media\/([^/]+)$/);
      if ((request.method === 'GET' || request.method === 'HEAD') && mediaMatch) {
        if (!mediaStore) return sendJson(response, 404, { error: 'not_found' });
        const key = decodeMediaKey(mediaMatch[1]);
        if (!key) return sendJson(response, 404, { error: 'not_found' });
        let asset;
        try {
          asset = await mediaStore.open(key);
        } catch (error) {
          const mapped = mediaErrorResponse(error);
          if (mapped) return sendJson(response, mapped.statusCode, { error: mapped.error });
          throw error;
        }
        response.writeHead(200, {
          'content-type': asset.contentType,
          'content-length': String(asset.size),
          'cache-control': 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff'
        });
        if (request.method === 'HEAD') {
          asset.stream.destroy();
          response.end();
          return;
        }
        asset.stream.on('error', () => response.destroy());
        response.once('close', () => asset.stream.destroy());
        asset.stream.pipe(response);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/posts') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await listPostsPayload(repository, {
          platform: url.searchParams.get('platform'),
          accountId: url.searchParams.get('accountId'),
          state: url.searchParams.get('state'),
          from: url.searchParams.get('from'),
          until: url.searchParams.get('until')
        });
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method === 'POST' && url.pathname === '/api/posts') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await createPostPayload(repository, await readJsonBody(request), { now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method === 'POST' && url.pathname === '/api/posts/bulk/cancel') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await bulkCancelPostsPayload(repository, await readJsonBody(request), { now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method === 'POST' && url.pathname === '/api/posts/bulk/reschedule') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await bulkReschedulePostsPayload(repository, await readJsonBody(request), { now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      const postMatch = url.pathname.match(/^\/api\/posts\/([^/]+)$/);
      if (request.method === 'PATCH' && postMatch) {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await updatePostPayload(repository, decodeURIComponent(postMatch[1]), await readJsonBody(request), { now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      const cancelPostMatch = url.pathname.match(/^\/api\/posts\/([^/]+)\/cancel$/);
      if (request.method === 'POST' && cancelPostMatch) {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await cancelPostPayload(repository, decodeURIComponent(cancelPostMatch[1]), { now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      const duplicatePostMatch = url.pathname.match(/^\/api\/posts\/([^/]+)\/duplicate$/);
      if (request.method === 'POST' && duplicatePostMatch) {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await duplicatePostPayload(repository, decodeURIComponent(duplicatePostMatch[1]), await readJsonBody(request), { now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      const retryPublicationMatch = url.pathname.match(/^\/api\/publications\/([^/]+)\/retry$/);
      if (request.method === 'POST' && retryPublicationMatch) {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await retryPublicationPayload(repository, decodeURIComponent(retryPublicationMatch[1]), await readJsonBody(request), { now: now() });
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method === 'GET' && url.pathname === '/api/accounts') {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await listAccountsPayload(repository);
        return sendJson(response, result.statusCode, result.payload);
      }

      const creatorInfo = url.pathname.match(/^\/api\/accounts\/([^/]+)\/tiktok\/creator-info$/);
      if (request.method === 'GET' && creatorInfo) {
        if (!repository) return sendJson(response, 503, { error: 'repository_unavailable' });
        const result = await getTikTokCreatorInfoPayload(repository, platformRegistry, decodeURIComponent(creatorInfo[1]));
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
        const provider = decodeURIComponent(oauthCallback[1]);
        const browserNavigation = requestPrefersHtml(request);
        if (!tokenCipher) {
          if (browserNavigation) {
            return sendRedirect(response, oauthDashboardLocation(provider, { status: 'error', code: 'oauth_not_configured' }));
          }
          return sendJson(response, 503, { error: 'oauth_not_configured' });
        }
        const result = await completeOAuthPayload({ provider, code: url.searchParams.get('code'), state: url.searchParams.get('state'), repository, providerRegistry: oauthProviderRegistry, cipher: tokenCipher, now: now() });
        if (browserNavigation) {
          const connected = result.statusCode >= 200 && result.statusCode < 300;
          return sendRedirect(response, oauthDashboardLocation(provider, {
            status: connected ? 'connected' : 'error',
            code: connected ? null : result.payload?.error
          }));
        }
        return sendJson(response, result.statusCode, result.payload);
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'method_not_allowed' });
      if (await serveStatic(url.pathname, response)) return;
      return sendJson(response, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof RequestBodyError) return sendJson(response, error.statusCode, { error: error.code });
      console.error('Request failed', { code: error?.code ?? 'INTERNAL_ERROR' });
      return sendJson(response, 500, { error: 'internal_error' });
    }
  };
}