const SAFE_DATABASE_BACKENDS = new Set(['json', 'postgres']);

export async function getHealthPayload(repository) {
  try {
    if (!repository || typeof repository.healthCheck !== 'function') throw new Error('DATABASE_HEALTH_UNAVAILABLE');
    const result = await repository.healthCheck();
    const backend = SAFE_DATABASE_BACKENDS.has(result?.backend) ? result.backend : 'unavailable';
    const database = { ok: result?.ok === true, backend };
    return {
      ok: database.ok,
      service: 'srocial',
      version: '0.1.0',
      database
    };
  } catch {
    return {
      ok: false,
      service: 'srocial',
      version: '0.1.0',
      database: { ok: false, backend: 'unavailable' }
    };
  }
}
