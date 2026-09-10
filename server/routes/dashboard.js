import { buildDashboardSummary, DEFAULT_CHANNELS } from '../services/dashboard-service.js';

export async function getDashboardPayload(repository = null) {
  if (!repository) return buildDashboardSummary();
  const [posts, accounts] = await Promise.all([
    repository.listPostsWithPublications(),
    typeof repository.listAccounts === 'function' ? repository.listAccounts() : []
  ]);
  const publications = posts.flatMap((post) => post.publications ?? []);
  const connectedPlatforms = new Set(accounts.filter((account) => account.connected).map((account) => account.platform));
  const channels = DEFAULT_CHANNELS.map((channel) => ({ ...channel, connected: connectedPlatforms.has(channel.key) }));
  return buildDashboardSummary(publications, channels);
}
