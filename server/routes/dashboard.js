import { buildDashboardSummary } from '../services/dashboard-service.js';

export async function getDashboardPayload(repository = null) {
  if (!repository) return buildDashboardSummary();
  const posts = await repository.listPostsWithPublications();
  const publications = posts.flatMap((post) => post.publications ?? []);
  return buildDashboardSummary(publications);
}
