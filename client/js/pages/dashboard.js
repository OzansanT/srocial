function renderCounts(counts) {
  for (const [name, value] of Object.entries(counts)) {
    const node = document.querySelector(`[data-count="${name}"]`);
    if (node) node.textContent = String(value);
  }
}

function createChannelRow(channel) {
  const row = document.createElement('div'); row.className = 'channel-row';
  const identity = document.createElement('div'); identity.className = 'channel-row__identity';
  const name = document.createElement('strong'); name.textContent = channel.name;
  const type = document.createElement('span'); type.className = 'channel-row__type'; type.textContent = channel.type === 'messaging' ? 'Business messaging' : 'Social publishing';
  const status = document.createElement('span'); status.className = 'channel-row__status'; status.dataset.connected = String(Boolean(channel.connected)); status.textContent = channel.connected ? 'Connected' : 'Not connected';
  identity.append(name, type); row.append(identity, status); return row;
}

function renderChannels(channels) {
  const list = document.querySelector('#channel-list');
  if (list) list.replaceChildren(...channels.map(createChannelRow));
}

function createScheduledRow(post) {
  const row = document.createElement('article'); row.className = 'scheduled-row';
  const copy = document.createElement('div');
  const caption = document.createElement('div'); caption.className = 'scheduled-row__caption'; caption.textContent = post.caption;
  const meta = document.createElement('div'); meta.className = 'scheduled-row__meta'; meta.textContent = new Date(post.scheduledAt).toLocaleString();
  copy.append(caption, meta);
  const platforms = document.createElement('div'); platforms.className = 'scheduled-row__platforms';
  for (const publication of post.publications ?? []) {
    const badge = document.createElement('span'); badge.className = 'platform-state'; badge.textContent = `${publication.platform} · ${publication.state.toLowerCase()}`; platforms.append(badge);
  }
  row.append(copy, platforms); return row;
}

export function renderScheduledPosts(posts = []) {
  const list = document.querySelector('#scheduled-post-list');
  const count = document.querySelector('#scheduled-post-count');
  if (count) count.textContent = `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`;
  if (!list) return;
  if (!posts.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<span class="empty-state__icon">+</span><h3>No scheduled posts yet</h3><p>Use the composer to create the first scheduled publication.</p>';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...posts.map(createScheduledRow));
}

export function renderDashboard(data) {
  renderCounts(data.counts ?? {});
  renderChannels(data.channels ?? []);
}
