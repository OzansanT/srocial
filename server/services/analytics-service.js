import { normalizeMetricSet } from '../analytics/metrics.js';

const PLATFORMS = new Set(['instagram', 'facebook', 'threads', 'tiktok']);
const METRICS = Object.freeze(['views', 'reach', 'likes', 'comments', 'shares', 'saves']);
const SAFE_PROVIDER_CODES = new Set([
  'AUTH_ERROR', 'PERMISSION_DENIED', 'RATE_LIMIT', 'NETWORK_ERROR', 'PROVIDER_ERROR',
  'ANALYTICS_NOT_FOUND', 'MEDIA_ERROR'
]);

function analyticsError(code, message = null) {
  const error = new Error(message ?? `Analytics request failed (${code}).`);
  error.code = code;
  return error;
}

function providerError(error) {
  const code = SAFE_PROVIDER_CODES.has(error?.code) ? error.code : 'PROVIDER_ERROR';
  const safe = analyticsError(code);
  safe.retryable = Boolean(error?.retryable);
  return safe;
}

function normalizePlatform(value) {
  const platform = String(value ?? '').trim().toLowerCase();
  if (!platform) return null;
  if (!PLATFORMS.has(platform)) throw analyticsError('ANALYTICS_FILTER_INVALID');
  return platform;
}

function normalizeDate(value, { end = false } = {}) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? Date.parse(`${text}T${end ? '23:59:59.999' : '00:00:00.000'}Z`)
    : Date.parse(text);
  if (!Number.isFinite(parsed)) throw analyticsError('ANALYTICS_FILTER_INVALID');
  return parsed;
}

function normalizeFilters(input = {}) {
  const fromMs = normalizeDate(input.from);
  const untilMs = normalizeDate(input.until, { end: true });
  if (fromMs != null && untilMs != null && fromMs > untilMs) throw analyticsError('ANALYTICS_FILTER_INVALID');
  return {
    platform: normalizePlatform(input.platform),
    accountId: String(input.accountId ?? '').trim() || null,
    from: String(input.from ?? '').trim() || null,
    until: String(input.until ?? '').trim() || null,
    fromMs,
    untilMs
  };
}

function publicationTime(post, publication) {
  return publication?.scheduledAt ?? post?.scheduledAt ?? publication?.updatedAt ?? post?.updatedAt ?? null;
}

function matchesFilters(post, publication, filters) {
  if (filters.platform && publication.platform !== filters.platform) return false;
  if (filters.accountId && publication.accountId !== filters.accountId) return false;
  const time = Date.parse(publicationTime(post, publication) ?? '');
  if (filters.fromMs != null && (!Number.isFinite(time) || time < filters.fromMs)) return false;
  if (filters.untilMs != null && (!Number.isFinite(time) || time > filters.untilMs)) return false;
  return true;
}

function latestSnapshots(snapshots) {
  const latest = new Map();
  for (const snapshot of snapshots ?? []) {
    const current = latest.get(snapshot.publicationId);
    const candidateTime = Date.parse(snapshot.capturedAt ?? '');
    const currentTime = Date.parse(current?.capturedAt ?? '');
    if (!current || candidateTime > currentTime || (candidateTime === currentTime && String(snapshot.id) > String(current.id))) {
      latest.set(snapshot.publicationId, snapshot);
    }
  }
  return latest;
}

function emptySummary() {
  return { views: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
}

function addMetrics(target, metrics) {
  for (const key of METRICS) if (metrics?.[key] != null) target[key] += Number(metrics[key]);
}

function engagement(metrics) {
  return ['likes', 'comments', 'shares', 'saves'].reduce((sum, key) => sum + Number(metrics?.[key] ?? 0), 0);
}

function dateKey(value) {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : 'unknown';
}

function captionExcerpt(value) {
  const caption = String(value ?? '').trim();
  return caption.length > 120 ? `${caption.slice(0, 117)}...` : caption;
}

export function createAnalyticsService({ repository, analyticsRegistry = new Map() } = {}) {
  if (!repository) throw new Error('ANALYTICS_REPOSITORY_REQUIRED');

  async function refreshPublication(publicationId, { now = new Date() } = {}) {
    const publication = await repository.getPublication(publicationId);
    if (!publication) throw analyticsError('ANALYTICS_NOT_FOUND');
    if (!PLATFORMS.has(publication.platform)) throw analyticsError('ANALYTICS_UNSUPPORTED_PROVIDER');
    if (publication.state !== 'PUBLISHED') throw analyticsError('ANALYTICS_PUBLICATION_NOT_PUBLISHED');
    if (!publication.externalId || !publication.accountId) throw analyticsError('ANALYTICS_PUBLICATION_INELIGIBLE');

    const account = await repository.getAccount(publication.accountId);
    if (!account) throw analyticsError('ANALYTICS_ACCOUNT_NOT_FOUND');
    if (account.state !== 'CONNECTED' || account.provider !== publication.platform) throw analyticsError('ANALYTICS_ACCOUNT_UNAVAILABLE');

    const adapter = analyticsRegistry.get(publication.platform);
    if (!adapter || typeof adapter.getMetrics !== 'function') throw analyticsError('ANALYTICS_NOT_CONFIGURED');

    let metrics;
    try {
      metrics = normalizeMetricSet(await adapter.getMetrics({ publication, account }));
    } catch (error) {
      throw providerError(error);
    }

    return repository.createPublicationMetricSnapshot({
      publicationId: publication.id,
      accountId: publication.accountId,
      provider: publication.platform,
      externalId: publication.externalId,
      ...metrics,
      capturedAt: now.toISOString()
    });
  }

  async function report(input = {}) {
    const filters = normalizeFilters(input);
    const [posts, snapshots, accounts] = await Promise.all([
      repository.listPostsWithPublications(),
      repository.listPublicationMetricSnapshots(),
      repository.listAccounts()
    ]);
    const accountMap = new Map((accounts ?? []).map((account) => [account.id, account]));
    const latest = latestSnapshots(snapshots);
    const summary = emptySummary();
    const seriesMap = new Map();
    const rows = [];
    const captureTimes = [];

    for (const post of posts ?? []) {
      for (const publication of post.publications ?? []) {
        if (publication.state !== 'PUBLISHED' || !matchesFilters(post, publication, filters)) continue;
        const snapshot = latest.get(publication.id);
        if (!snapshot) continue;
        addMetrics(summary, snapshot);
        const key = dateKey(publicationTime(post, publication));
        if (!seriesMap.has(key)) seriesMap.set(key, { date: key, ...emptySummary() });
        addMetrics(seriesMap.get(key), snapshot);
        captureTimes.push(snapshot.capturedAt);
        const account = accountMap.get(publication.accountId) ?? null;
        rows.push({
          postId: post.id,
          publicationId: publication.id,
          platform: publication.platform,
          accountId: publication.accountId ?? null,
          accountName: account?.displayName ?? account?.username ?? null,
          caption: captionExcerpt(post.caption),
          publishedAt: publicationTime(post, publication),
          capturedAt: snapshot.capturedAt,
          metrics: Object.fromEntries(METRICS.map((keyName) => [keyName, snapshot[keyName] ?? null]))
        });
      }
    }

    rows.sort((a, b) => {
      const viewDelta = Number(b.metrics.views ?? -1) - Number(a.metrics.views ?? -1);
      return viewDelta || engagement(b.metrics) - engagement(a.metrics) || String(b.publishedAt).localeCompare(String(a.publishedAt));
    });
    const orderedCaptures = captureTimes.filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b));
    return {
      filters: { platform: filters.platform, accountId: filters.accountId, from: filters.from, until: filters.until },
      count: rows.length,
      summary,
      series: [...seriesMap.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))),
      posts: rows,
      freshness: {
        oldestCapturedAt: orderedCaptures[0] ?? null,
        newestCapturedAt: orderedCaptures.at(-1) ?? null
      }
    };
  }

  async function refreshRecent(input = {}, { now = new Date(), limit = 25 } = {}) {
    const filters = normalizeFilters(input);
    const posts = await repository.listPostsWithPublications();
    const candidates = [];
    for (const post of posts ?? []) {
      for (const publication of post.publications ?? []) {
        if (publication.state !== 'PUBLISHED' || !publication.accountId || !publication.externalId) continue;
        if (!matchesFilters(post, publication, filters)) continue;
        candidates.push({ publication, time: Date.parse(publicationTime(post, publication) ?? '') });
      }
    }
    candidates.sort((a, b) => Number(b.time || 0) - Number(a.time || 0));
    const bounded = candidates.slice(0, Math.min(25, Math.max(0, Number.parseInt(limit, 10) || 25)));
    const results = [];
    for (const candidate of bounded) {
      try {
        const snapshot = await refreshPublication(candidate.publication.id, { now });
        results.push({ publicationId: candidate.publication.id, ok: true, snapshot });
      } catch (error) {
        results.push({ publicationId: candidate.publication.id, ok: false, error: String(error?.code ?? 'PROVIDER_ERROR').toLowerCase() });
      }
    }
    return {
      filters: { platform: filters.platform, accountId: filters.accountId, from: filters.from, until: filters.until },
      attempted: results.length,
      succeeded: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results
    };
  }

  return { refreshPublication, refreshRecent, report };
}
