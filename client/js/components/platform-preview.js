function text(value) {
  return String(value ?? '');
}

function effectiveCaption(payload, destination) {
  const platformOverride = payload?.platformOverrides?.[destination.platform] ?? {};
  if (destination.captionOverride !== null && destination.captionOverride !== undefined) return text(destination.captionOverride);
  if (Object.prototype.hasOwnProperty.call(platformOverride, 'caption')) return text(platformOverride.caption);
  return text(payload?.caption);
}

function effectiveMedia(payload, destination) {
  const platformOverride = payload?.platformOverrides?.[destination.platform] ?? {};
  if (destination.mediaOverride !== null && destination.mediaOverride !== undefined) return destination.mediaOverride;
  if (Object.prototype.hasOwnProperty.call(platformOverride, 'media')) return platformOverride.media;
  return Array.isArray(payload?.media) ? payload.media : [];
}

function element(tag, className, content = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== null) node.textContent = content;
  return node;
}

export function renderPlatformPreviews({ container, compatibility = { destinations: [] }, payload = {} } = {}) {
  if (!container) return;
  const destinations = Array.isArray(payload.destinations) ? payload.destinations : [];
  const reports = new Map((compatibility.destinations ?? []).map((item) => [`${item.platform}:${item.accountId}`, item]));
  const fragment = document.createDocumentFragment();

  for (const destination of destinations) {
    const card = element('article', 'platform-preview-card');
    const report = reports.get(`${destination.platform}:${destination.accountId}`) ?? {};
    const caption = effectiveCaption(payload, destination);
    const media = effectiveMedia(payload, destination);
    const captionLength = Number.isFinite(Number(report.captionLength)) ? Number(report.captionLength) : caption.length;
    const captionLimit = Number.isFinite(Number(report.captionLimit)) ? Number(report.captionLimit) : null;

    const header = element('div', 'platform-preview-card__header');
    header.append(
      element('strong', 'platform-preview-card__platform', destination.platform || 'platform'),
      element('span', 'platform-preview-card__count', captionLimit === null ? `${captionLength}` : `${captionLength} / ${captionLimit}`)
    );
    card.append(header);
    card.append(element('p', 'platform-preview-card__caption', caption || 'No caption yet.'));

    const mediaSummary = media.length
      ? media.map((item) => `${item.type || 'media'}: ${item.url || 'no URL'}`).join(' · ')
      : 'Text-only';
    card.append(element('p', 'platform-preview-card__media', mediaSummary));

    const state = element('div', `platform-preview-card__state ${report.compatible === false ? 'is-warning' : 'is-ready'}`);
    state.textContent = report.compatible === false ? 'Needs attention' : 'Ready';
    card.append(state);

    const issues = Array.isArray(report.issues) ? report.issues : [];
    if (issues.length) {
      const list = element('ul', 'platform-preview-card__issues');
      for (const issue of issues) list.append(element('li', '', issue.message ?? issue.code ?? 'Compatibility issue'));
      card.append(list);
    }
    fragment.append(card);
  }

  if (!destinations.length) fragment.append(element('p', 'muted', 'Select a destination to preview platform output.'));
  container.replaceChildren(fragment);
}