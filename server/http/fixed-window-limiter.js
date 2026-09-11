function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
}

export function createFixedWindowLimiter({ windowMs, max, now = () => Date.now() } = {}) {
  requirePositiveInteger(windowMs, 'windowMs');
  requirePositiveInteger(max, 'max');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const buckets = new Map();

  function prune(currentTime) {
    for (const [key, bucket] of buckets) {
      if (currentTime - bucket.windowStart >= windowMs) buckets.delete(key);
    }
  }

  return Object.freeze({
    consume(key) {
      const bucketKey = String(key ?? 'unknown');
      const currentTime = Number(now());
      prune(currentTime);

      let bucket = buckets.get(bucketKey);
      if (!bucket) {
        bucket = { windowStart: currentTime, count: 1 };
        buckets.set(bucketKey, bucket);
        return { allowed: true, retryAfterSeconds: 0, remaining: max - 1 };
      }

      if (bucket.count < max) {
        bucket.count += 1;
        return { allowed: true, retryAfterSeconds: 0, remaining: max - bucket.count };
      }

      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.windowStart + windowMs - currentTime) / 1000));
      return { allowed: false, retryAfterSeconds, remaining: 0 };
    },

    reset(key) {
      buckets.delete(String(key ?? 'unknown'));
    }
  });
}
