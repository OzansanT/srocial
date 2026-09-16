function normalizeInput({ scope, key, windowMs, max, nowMs }) {
  const normalizedScope = String(scope ?? '').trim();
  const normalizedKey = String(key ?? '').trim();
  const normalizedWindowMs = Number(windowMs);
  const normalizedMax = Number(max);
  const normalizedNowMs = Number(nowMs);

  if (!normalizedScope) throw new TypeError('rate limit scope is required');
  if (!normalizedKey) throw new TypeError('rate limit key is required');
  if (!Number.isInteger(normalizedWindowMs) || normalizedWindowMs <= 0) throw new TypeError('windowMs must be a positive integer');
  if (!Number.isInteger(normalizedMax) || normalizedMax <= 0) throw new TypeError('max must be a positive integer');
  if (!Number.isSafeInteger(normalizedNowMs) || normalizedNowMs < 0) throw new TypeError('nowMs must be a non-negative safe integer');

  return {
    scope: normalizedScope,
    key: normalizedKey,
    windowMs: normalizedWindowMs,
    max: normalizedMax,
    nowMs: normalizedNowMs
  };
}

export function createPostgresRateLimits(pool) {
  return {
    async consumeRateLimit(input) {
      const { scope, key, windowMs, max, nowMs } = normalizeInput(input ?? {});
      if (typeof pool?.connect !== 'function') throw new Error('DATABASE_RATE_LIMIT_TRANSACTIONS_REQUIRED');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO rate_limit_buckets (scope, client_key, window_start_ms, request_count, updated_at)
           VALUES ($1,$2,$3,0,to_timestamp($3 / 1000.0))
           ON CONFLICT (scope, client_key) DO NOTHING`,
          [scope, key, nowMs]
        );

        const selected = await client.query(
          `SELECT window_start_ms, request_count
           FROM rate_limit_buckets
           WHERE scope = $1 AND client_key = $2
           FOR UPDATE`,
          [scope, key]
        );
        const row = selected.rows[0];
        if (!row) throw new Error('RATE_LIMIT_BUCKET_NOT_FOUND');

        let windowStartMs = Number(row.window_start_ms);
        let requestCount = Number(row.request_count);
        if (!Number.isSafeInteger(windowStartMs) || !Number.isInteger(requestCount)) {
          throw new Error('RATE_LIMIT_BUCKET_INVALID');
        }

        if (nowMs - windowStartMs >= windowMs) {
          windowStartMs = nowMs;
          requestCount = 0;
        }

        if (requestCount < max) {
          requestCount += 1;
          await client.query(
            `UPDATE rate_limit_buckets
             SET window_start_ms = $3, request_count = $4, updated_at = to_timestamp($5 / 1000.0)
             WHERE scope = $1 AND client_key = $2`,
            [scope, key, windowStartMs, requestCount, nowMs]
          );
          await client.query('COMMIT');
          return {
            allowed: true,
            retryAfterSeconds: 0,
            remaining: Math.max(0, max - requestCount)
          };
        }

        await client.query(
          `UPDATE rate_limit_buckets
           SET updated_at = to_timestamp($3 / 1000.0)
           WHERE scope = $1 AND client_key = $2`,
          [scope, key, nowMs]
        );
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((windowStartMs + windowMs - nowMs) / 1000)
        );
        await client.query('COMMIT');
        return { allowed: false, retryAfterSeconds, remaining: 0 };
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
      } finally {
        client.release();
      }
    }
  };
}
