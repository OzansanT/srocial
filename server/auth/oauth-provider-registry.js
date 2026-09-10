function normalize(name) { return String(name ?? '').trim().toLowerCase(); }
export function createOAuthProviderRegistry() { return new Map(); }
export function registerOAuthProvider(registry, name, adapter) {
  const key = normalize(name);
  if (!key) throw new Error('OAUTH_PROVIDER_NAME_REQUIRED');
  if (registry.has(key)) throw new Error(`OAuth provider "${key}" is already registered`);
  registry.set(key, adapter);
  return registry;
}
export function getOAuthProvider(registry, name) {
  const key = normalize(name);
  const adapter = registry.get(key);
  if (!adapter) throw new Error('UNSUPPORTED_PROVIDER');
  return adapter;
}
