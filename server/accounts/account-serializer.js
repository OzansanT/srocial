export function toSafeAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    platform: account.platform,
    providerAccountId: account.providerAccountId ?? null,
    displayName: account.displayName ?? null,
    connected: Boolean(account.connected),
    scopes: Array.isArray(account.scopes) ? [...account.scopes] : [],
    tokenExpiresAt: account.tokenExpiresAt ?? null,
    createdAt: account.createdAt ?? null,
    updatedAt: account.updatedAt ?? null
  };
}
