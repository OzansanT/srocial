const SUPPORTED = new Set(['instagram', 'facebook', 'threads', 'tiktok']);

function normalizeProvider(provider) {
  const normalized = String(provider ?? '').trim().toLowerCase();
  if (!SUPPORTED.has(normalized)) throw new Error(`Unsupported analytics provider: ${normalized || 'empty'}`);
  return normalized;
}

export function createAnalyticsRegistry() {
  return new Map();
}

export function registerAnalyticsProvider(registry, provider, adapter) {
  if (!(registry instanceof Map)) throw new Error('Analytics registry is required');
  if (!adapter || typeof adapter.getMetrics !== 'function') throw new Error('Analytics adapter must implement getMetrics');
  const normalized = normalizeProvider(provider);
  if (registry.has(normalized)) throw new Error(`Analytics provider already registered: ${normalized}`);
  registry.set(normalized, adapter);
  return adapter;
}

export function getAnalyticsProvider(registry, provider) {
  return registry instanceof Map ? registry.get(normalizeProvider(provider)) ?? null : null;
}
