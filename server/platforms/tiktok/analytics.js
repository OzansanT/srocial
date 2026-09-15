import { normalizeMetricSet } from '../../analytics/metrics.js';

export function createTikTokAnalyticsAdapter({ client, resolveCredentials }) {
  return {
    async getMetrics({ publication }) {
      const credentials = await resolveCredentials(publication.accountId);
      const payload = await client.postApi('/v2/video/query/', {
        accessToken: credentials.accessToken,
        query: { fields: 'id,view_count,like_count,comment_count,share_count' },
        body: { filters: { video_ids: [publication.externalId] } }
      });
      const videos = Array.isArray(payload?.data?.videos) ? payload.data.videos : [];
      const video = videos.find((item) => String(item?.id) === String(publication.externalId)) ?? videos[0];
      if (!video) {
        const error = new Error('Analytics video not found');
        error.code = 'ANALYTICS_NOT_FOUND';
        throw error;
      }
      return normalizeMetricSet({
        views: video.view_count,
        reach: null,
        likes: video.like_count,
        comments: video.comment_count,
        shares: video.share_count,
        saves: null,
        extraMetrics: {}
      });
    }
  };
}
