export function legacyPlatformSchedulingEnabled(env = process.env) {
  return String(env?.ALLOW_LEGACY_PLATFORM_SCHEDULING ?? '').trim().toLowerCase() === 'true';
}
