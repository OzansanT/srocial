import { insightValue, normalizeMetricSet } from '../../analytics/metrics.js';

export function createThreadsAnalyticsAdapter({ client, resolveCredentials }) {
  return {
    async getMetrics({ publication }) {
      const credentials = await resolveCredentials(publication.accountId);
      const payload = await client.getGraph(`${publication.externalId}/insights`, {
        accessToken: credentials.accessToken,
        query: { metric: 'views,likes,replies,reposts,quotes,shares' }
      });
      return normalizeMetricSet({
        views: insightValue(payload, 'views'),
        reach: null,
        likes: insightValue(payload, 'likes'),
        comments: insightValue(payload, 'replies'),
        shares: insightValue(payload, 'shares'),
        saves: null,
        extraMetrics: {
          reposts: insightValue(payload, 'reposts'),
          quotes: insightValue(payload, 'quotes')
        }
      });
    }
  };
}
