export function createJsonAnalytics({ mutate, stableRead, getData }) {
  return {
    createPublicationMetricSnapshot(record) {
      return mutate('publicationMetricSnapshots', record);
    },
    listPublicationMetricSnapshots({ publicationId = null, accountId = null, provider = null } = {}) {
      return stableRead(() => getData().publicationMetricSnapshots
        .filter((item) => !publicationId || item.publicationId === publicationId)
        .filter((item) => !accountId || item.accountId === accountId)
        .filter((item) => !provider || item.provider === provider)
        .sort((a, b) => Date.parse(a.capturedAt ?? '') - Date.parse(b.capturedAt ?? '')));
    },
    getLatestPublicationMetricSnapshot(publicationId) {
      return stableRead(() => [...getData().publicationMetricSnapshots]
        .filter((item) => item.publicationId === publicationId)
        .sort((a, b) => Date.parse(b.capturedAt ?? '') - Date.parse(a.capturedAt ?? ''))[0] ?? null);
    }
  };
}
