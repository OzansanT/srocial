function renderCounts(counts) {
  for (const [name, value] of Object.entries(counts)) {
    const node = document.querySelector(`[data-count="${name}"]`);
    if (node) node.textContent = String(value);
  }
}

function createChannelRow(channel) {
  const row = document.createElement('div');
  row.className = 'channel-row';

  const identity = document.createElement('div');
  identity.className = 'channel-row__identity';

  const name = document.createElement('strong');
  name.textContent = channel.name;

  const type = document.createElement('span');
  type.className = 'channel-row__type';
  type.textContent = channel.type === 'messaging' ? 'Business messaging' : 'Social publishing';

  const status = document.createElement('span');
  status.className = 'channel-row__status';
  status.dataset.connected = String(Boolean(channel.connected));
  status.textContent = channel.connected ? 'Connected' : 'Not connected';

  identity.append(name, type);
  row.append(identity, status);
  return row;
}

function renderChannels(channels) {
  const list = document.querySelector('#channel-list');
  if (!list) return;
  list.replaceChildren(...channels.map(createChannelRow));
}

export function renderDashboard(data) {
  renderCounts(data.counts ?? {});
  renderChannels(data.channels ?? []);
}
