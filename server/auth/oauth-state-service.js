import { createHash, randomBytes } from 'node:crypto';

function normalizeProvider(provider) { return String(provider ?? '').trim().toLowerCase(); }
function hashState(state) { return createHash('sha256').update(String(state)).digest('hex'); }

export async function issueOAuthState(repository, { provider, redirectUri, now = new Date(), ttlMs = 10 * 60 * 1000 } = {}) {
  const normalizedProvider = normalizeProvider(provider);
  if (!normalizedProvider) throw new Error('OAUTH_PROVIDER_REQUIRED');
  const state = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  await repository.createOAuthState({ stateHash: hashState(state), provider: normalizedProvider, redirectUri: String(redirectUri ?? ''), createdAt: now.toISOString(), expiresAt, consumedAt: null });
  return { state, expiresAt };
}

export async function consumeOAuthState(repository, { provider, state, now = new Date() } = {}) {
  if (!String(state ?? '').trim()) throw new Error('OAUTH_STATE_INVALID');
  const stateHash = hashState(state);
  const existing = await repository.getOAuthState(stateHash);
  if (!existing || existing.consumedAt || Date.parse(existing.expiresAt ?? '') <= now.getTime()) throw new Error('OAUTH_STATE_INVALID');
  if (existing.provider !== normalizeProvider(provider)) throw new Error('OAUTH_STATE_PROVIDER_MISMATCH');
  const record = await repository.consumeOAuthState(stateHash, { now });
  if (!record) throw new Error('OAUTH_STATE_INVALID');
  return record;
}
