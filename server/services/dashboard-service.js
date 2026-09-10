const TRACKED_COUNTS = Object.freeze({
  SCHEDULED: 'scheduled',
  PUBLISHED: 'published',
  PROCESSING: 'processing',
  FAILED: 'failed'
});

export const DEFAULT_CHANNELS = Object.freeze([
  { name: 'Instagram', key: 'instagram', type: 'social', connected: false },
  { name: 'Facebook', key: 'facebook', type: 'social', connected: false },
  { name: 'Threads', key: 'threads', type: 'social', connected: false },
  { name: 'TikTok', key: 'tiktok', type: 'social', connected: false },
  { name: 'WhatsApp Business', key: 'whatsapp', type: 'messaging', connected: false }
]);

export function buildDashboardSummary(publications = [], channels = DEFAULT_CHANNELS) {
  const counts = { scheduled: 0, published: 0, processing: 0, failed: 0 };

  for (const publication of publications) {
    const key = TRACKED_COUNTS[publication.state];
    if (key) counts[key] += 1;
  }

  return { counts, channels };
}
