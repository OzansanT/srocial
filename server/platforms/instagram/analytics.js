import { insightValue, normalizeMetricSet } from '../../analytics/metrics.js';

export function createInstagramAnalyticsAdapter({ client, resolveCredentials }) {
  return {
    async getMetrics({ publication }) {
      const credentials = await resolveCredentials(publication.accountId);
      const payload = await client.getGraph(`${publication.externalId}/insights`, {
        accessToken: credentials.accessToken,
        query: { metric: 'views,reach,likes,comments,shares,saved' }
      });
      return normalizeMetricSet({
        views: insightValue(payload, 'views'),
        reach: insightValue(payload, 'reach'),
        likes: insightValue(payload, 'likes'),
        comments: insightValue(payload, 'comments'),
        shares: insightValue(payload, 'shares'),
        saves: insightValue(payload, 'saved'),
        extraMetrics: {}
      });
    }
  };
}
