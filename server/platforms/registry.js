export function createPlatformRegistry() {
  return new Map();
}

export function registerPlatform(registry, name, adapter) {
  const key = String(name ?? '').trim().toLowerCase();
  if (!key) throw new Error('Platform name is required');
  if (registry.has(key)) throw new Error(`Platform "${key}" is already registered`);
  registry.set(key, adapter);
  return registry;
}
