import { completeOAuthConnection, startOAuthConnection } from '../services/oauth-service.js';

function safeError(error) {
  const code = error?.message;
  if (code === 'UNSUPPORTED_PROVIDER') return { statusCode: 400, payload: { error: 'unsupported_provider' } };
  if (code === 'OAUTH_CODE_REQUIRED') return { statusCode: 400, payload: { error: 'oauth_code_required' } };
  if (code === 'OAUTH_STATE_INVALID') return { statusCode: 400, payload: { error: 'oauth_state_invalid' } };
  if (code === 'OAUTH_STATE_PROVIDER_MISMATCH') return { statusCode: 400, payload: { error: 'oauth_state_provider_mismatch' } };
  return null;
}

export async function startOAuthPayload({ provider, redirectUri, repository, providerRegistry, publicBaseUrl, now }) {
  try {
    const callbackUri = redirectUri || `${String(publicBaseUrl || 'http://127.0.0.1:3000').replace(/\/$/, '')}/api/oauth/${encodeURIComponent(provider)}/callback`;
    const result = await startOAuthConnection({ provider, redirectUri: callbackUri, repository, providerRegistry, now });
    return { statusCode: 200, payload: result };
  } catch (error) {
    const mapped = safeError(error);
    if (mapped) return mapped;
    throw error;
  }
}

export async function completeOAuthPayload({ provider, code, state, repository, providerRegistry, cipher, now }) {
  try {
    const result = await completeOAuthConnection({ provider, code, state, repository, providerRegistry, cipher, now });
    return { statusCode: 200, payload: result };
  } catch (error) {
    const mapped = safeError(error);
    if (mapped) return mapped;
    return { statusCode: 502, payload: { error: 'oauth_provider_error' } };
  }
}
