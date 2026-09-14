const ERROR_RESPONSES = Object.freeze({
  AUTH_ERROR: { statusCode:401, error:'auth_error' },
  PERMISSION_DENIED: { statusCode:403, error:'permission_denied' },
  RATE_LIMIT: { statusCode:429, error:'rate_limit' },
  NETWORK_ERROR: { statusCode:503, error:'provider_unavailable' },
  PROVIDER_ERROR: { statusCode:503, error:'provider_unavailable' }
});

export async function getTikTokCreatorInfoPayload(repository, platformRegistry, accountId) {
  const id=String(accountId ?? '').trim();
  const account=id ? await repository.getAccount(id) : null;
  if (!account) return { statusCode:404, payload:{ error:'account_not_found' } };
  if (account.provider !== 'tiktok') return { statusCode:409, payload:{ error:'account_not_tiktok' } };
  if (account.state !== 'CONNECTED') return { statusCode:409, payload:{ error:'account_not_connected' } };
  const adapter=platformRegistry?.get?.('tiktok');
  if (!adapter || typeof adapter.getCreatorInfo !== 'function') return { statusCode:503, payload:{ error:'tiktok_not_configured' } };
  try {
    const creatorInfo=await adapter.getCreatorInfo({ accountId:id });
    return { statusCode:200, payload:{ creatorInfo } };
  } catch (error) {
    const mapped=ERROR_RESPONSES[error?.code] ?? { statusCode:502, error:'provider_error' };
    return { statusCode:mapped.statusCode, payload:{ error:mapped.error } };
  }
}
