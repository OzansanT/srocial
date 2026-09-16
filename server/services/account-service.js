import { deriveAccountHealth } from './account-health.js';

export const ACCOUNT_STATES = Object.freeze({
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  EXPIRED: 'EXPIRED',
  ERROR: 'ERROR'
});

function normalizeProvider(provider) { return String(provider ?? '').trim().toLowerCase(); }

export function toSafeAccount(account, { now = new Date() } = {}) {
  if (!account) return null;
  const { accessTokenEncrypted, refreshTokenEncrypted, ...safe } = account;
  return { ...safe, ...deriveAccountHealth(account, { now }) };
}

export async function upsertConnectedAccount(repository, cipher, connection, { now = new Date() } = {}) {
  const provider = normalizeProvider(connection?.provider);
  const providerAccountId = String(connection?.providerAccountId ?? '').trim();
  if (!provider || !providerAccountId) throw new Error('ACCOUNT_IDENTITY_REQUIRED');
  const timestamp = now.toISOString();
  const patch = {
    provider,
    providerAccountId,
    displayName: connection.displayName ?? null,
    username: connection.username ?? null,
    state: ACCOUNT_STATES.CONNECTED,
    scopes: Array.isArray(connection.scopes) ? [...connection.scopes] : [],
    accessTokenEncrypted: cipher.encrypt(connection.accessToken ?? null),
    refreshTokenEncrypted: cipher.encrypt(connection.refreshToken ?? null),
    tokenExpiresAt: connection.expiresAt ?? null,
    connectedAt: timestamp,
    disconnectedAt: null,
    lastErrorCode: null,
    updatedAt: timestamp
  };
  const existing = await repository.findAccountByProviderIdentity(provider, providerAccountId);
  const account = existing
    ? await repository.updateAccount(existing.id, patch)
    : await repository.createAccount({ ...patch, createdAt: timestamp });
  return toSafeAccount(account, { now });
}

export async function listSafeAccounts(repository, { now = new Date() } = {}) {
  return (await repository.listAccounts()).map((account) => toSafeAccount(account, { now }));
}

export async function disconnectAccount(repository, id, { now = new Date() } = {}) {
  const existing = await repository.getAccount(id);
  if (!existing) throw new Error('ACCOUNT_NOT_FOUND');
  const timestamp = now.toISOString();
  const updated = await repository.updateAccount(id, {
    state: ACCOUNT_STATES.DISCONNECTED,
    accessTokenEncrypted: null,
    refreshTokenEncrypted: null,
    tokenExpiresAt: null,
    disconnectedAt: timestamp,
    lastErrorCode: null,
    updatedAt: timestamp
  });
  return toSafeAccount(updated, { now });
}
