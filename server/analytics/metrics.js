const METRIC_KEYS = Object.freeze(['views', 'reach', 'likes', 'comments', 'shares', 'saves']);

function invalidMetric() {
  const error = new Error('Analytics provider returned invalid metric data');
  error.code = 'PROVIDER_ERROR';
  return error;
}

export function normalizeMetric(value) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw invalidMetric();
  return number;
}

export function normalizeMetricSet(input = {}) {
  const output = {};
  for (const key of METRIC_KEYS) output[key] = normalizeMetric(input[key]);
  const extraMetrics = {};
  if (input.extraMetrics && typeof input.extraMetrics === 'object' && !Array.isArray(input.extraMetrics)) {
    for (const [key, value] of Object.entries(input.extraMetrics)) {
      const normalized = normalizeMetric(value);
      if (normalized != null) extraMetrics[key] = normalized;
    }
  }
  output.extraMetrics = extraMetrics;
  return output;
}

export function insightValue(payload, name) {
  const row = Array.isArray(payload?.data) ? payload.data.find((item) => item?.name === name) : null;
  const values = Array.isArray(row?.values) ? row.values : [];
  const raw = values.length ? values[values.length - 1]?.value : row?.value;
  return normalizeMetric(raw ?? null);
}
