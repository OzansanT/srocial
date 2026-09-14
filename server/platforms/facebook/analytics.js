import { insightValue, normalizeMetric, normalizeMetricSet } from '../../analytics/metrics.js';

export function createFacebookAnalyticsAdapter({ client, resolveCredentials }) {
  return {
    async getMetrics({ publication }) {
      const credentials = await resolveCredentials(publication.accountId);
      const payload = await client.getGraph(publication.externalId, {
        accessToken: credentials.accessToken,
        query: {
          fields: 'insights.metric(post_media_view,post_total_media_view_unique),likes.limit(0).summary(true),comments.limit(0).summary(true),shares'
        }
      });
      return normalizeMetricSet({
        views: insightValue(payload?.insights, 'post_media_view'),
        reach: insightValue(payload?.insights, 'post_total_media_view_unique'),
        likes: normalizeMetric(payload?.likes?.summary?.total_count ?? null),
        comments: normalizeMetric(payload?.comments?.summary?.total_count ?? null),
        shares: normalizeMetric(payload?.shares?.count ?? null),
        saves: null,
        extraMetrics: {}
      });
    }
  };
}
