const PROVIDERS = new Set(['instagram', 'facebook', 'threads', 'tiktok']);

function normalizeProvider(value) {
  return String(value ?? '').trim().toLowerCase();
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export async function recordProviderSuccess(repository, provider, { now = new Date() } = {}) {
  const normalized = normalizeProvider(provider);
  if (!PROVIDERS.has(normalized) || typeof repository?.upsertProviderStatus !== 'function') return null;
  const at = timestamp(now);
  return repository.upsertProviderStatus(normalized, {
    healthState: 'HEALTHY',
    lastSuccessAt: at,
    lastErrorCode: null,
    limitedUntil: null,
    updatedAt: at
  });
}

export async function recordProviderFailure(repository, provider, code, { now = new Date(), limitedUntil = null } = {}) {
  const normalized = normalizeProvider(provider);
  if (!PROVIDERS.has(normalized) || typeof repository?.upsertProviderStatus !== 'function') return null;
  const normalizedCode = String(code ?? 'PROVIDER_ERROR').trim().toUpperCase() || 'PROVIDER_ERROR';
  const at = timestamp(now);
  const healthState = normalizedCode === 'AUTH_ERROR' || normalizedCode === 'PERMISSION_DENIED' ? 'ERROR' : 'DEGRADED';
  return repository.upsertProviderStatus(normalized, {
    healthState,
    lastErrorAt: at,
    lastErrorCode: normalizedCode,
    limitedUntil: normalizedCode === 'RATE_LIMIT' ? timestamp(limitedUntil) : null,
    updatedAt: at
  });
}
