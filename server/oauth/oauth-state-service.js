import { createHash, randomBytes } from 'node:crypto';

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export class OAuthStateError extends Error {
  constructor(code) {
    super(code);
    this.name = 'OAuthStateError';
    this.code = code;
  }
}

export function hashOAuthState(state) {
  return createHash('sha256').update(String(state ?? '')).digest('hex');
}

export function normalizeReturnTo(value) {
  const candidate = String(value ?? '/');
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return '/';
  return candidate;
}

export async function createOAuthState({ repository, provider, returnTo = '/', now = new Date(), ttlMs = DEFAULT_TTL_MS }) {
  const normalizedProvider = String(provider ?? '').trim().toLowerCase();
  if (!normalizedProvider) throw new OAuthStateError('INVALID_OAUTH_STATE');
  const state = randomBytes(32).toString('base64url');
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + Math.max(1, Number(ttlMs) || DEFAULT_TTL_MS)).toISOString();
  const record = await repository.createOAuthState({
    provider: normalizedProvider,
    stateHash: hashOAuthState(state),
    returnTo: normalizeReturnTo(returnTo),
    createdAt,
    expiresAt,
    consumedAt: null
  });
  return { state, expiresAt, recordId: record.id };
}

export async function consumeOAuthState({ repository, provider, state, now = new Date() }) {
  const normalizedProvider = String(provider ?? '').trim().toLowerCase();
  if (!normalizedProvider || !String(state ?? '')) throw new OAuthStateError('INVALID_OAUTH_STATE');
  const result = await repository.consumeOAuthState({
    provider: normalizedProvider,
    stateHash: hashOAuthState(state),
    now
  });
  if (result.status === 'expired') throw new OAuthStateError('EXPIRED_OAUTH_STATE');
  if (result.status !== 'ok') throw new OAuthStateError('INVALID_OAUTH_STATE');
  return result.record;
}
