import { deleteMediaAsset, listMediaAssets } from '../api/media-library-api.js';

const MEDIA_LIBRARY_ERRORS = Object.freeze({
  media_in_use: 'This file is still used by a post and cannot be deleted.',
  not_found: 'This media file no longer exists.',
  media_storage_unavailable: 'Media storage is currently unavailable.'
});

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[index]}`;
}

function createButton(label, className = 'button button--secondary') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

function renderUsage(summary, progress, usage) {
  if (!summary || !progress) return;
  const used = Math.max(0, Number(usage?.usedBytes) || 0);
  const max = Math.max(1, Number(usage?.maxBytes) || 1);
  const count = Math.max(0, Number(usage?.count) || 0);
  summary.textContent = `${formatBytes(used)} of ${formatBytes(max)} used · ${count} file${count === 1 ? '' : 's'}`;
  progress.max = max;
  progress.value = Math.min(used, max);
  progress.setAttribute('aria-valuetext', `${formatBytes(used)} of ${formatBytes(max)} used`);
}

function previewForAsset(asset) {
  if (asset.type === 'video') {
    const video = document.createElement('video');
    video.src = asset.url;
    video.controls = true;
    video.muted = true;
    video.preload = 'metadata';
    video.className = 'media-card__preview';
    return video;
  }
  const image = document.createElement('img');
  image.src = asset.url;
  image.alt = 'Uploaded media preview';
  image.loading = 'lazy';
  image.className = 'media-card__preview';
  return image;
}

export function initializeMediaLibrary({ onUseMedia } = {}) {
  const list = document.querySelector('#media-library-list');
  const feedback = document.querySelector('#media-library-feedback');
  const refreshButton = document.querySelector('#refresh-media-library');
  const summary = document.querySelector('#media-storage-summary');
  const progress = document.querySelector('#media-storage-progress');
  if (!list || !feedback) return { refresh: async () => null };

  function setFeedback(message = '', state = '') {
    feedback.dataset.state = state;
    feedback.textContent = message;
  }

  async function copyUrl(url) {
    if (!navigator.clipboard?.writeText) throw new Error('CLIPBOARD_UNAVAILABLE');
    await navigator.clipboard.writeText(url);
  }

  function renderAsset(asset, refresh) {
    const card = document.createElement('article');
    card.className = 'media-card';
    card.append(previewForAsset(asset));

    const body = document.createElement('div');
    body.className = 'media-card__body';

    const meta = document.createElement('div');
    meta.className = 'media-card__meta';
    const title = document.createElement('strong');
    title.textContent = asset.type === 'video' ? 'Video' : 'Image';
    const size = document.createElement('span');
    size.textContent = formatBytes(asset.size);
    meta.append(title, size);

    if (asset.referenced) {
      const badge = document.createElement('span');
      badge.className = 'media-card__badge';
      badge.textContent = 'In use';
      meta.append(badge);
    }

    const actions = document.createElement('div');
    actions.className = 'media-card__actions';

    const useButton = createButton('Use in composer');
    useButton.addEventListener('click', () => {
      onUseMedia?.({ type: asset.type, url: asset.url });
      window.location.hash = 'create';
      document.querySelector('#media-url')?.focus();
    });

    const copyButton = createButton('Copy URL');
    copyButton.addEventListener('click', async () => {
      try {
        await copyUrl(asset.url);
        setFeedback('Media URL copied.', 'success');
      } catch {
        setFeedback('Clipboard access is unavailable. Copy the URL from the composer after selecting the media.', 'error');
      }
    });

    const deleteButton = createButton('Delete', 'button button--secondary media-card__delete');
    deleteButton.disabled = Boolean(asset.referenced);
    deleteButton.title = asset.referenced ? 'Referenced media cannot be deleted.' : 'Delete unused media';
    deleteButton.addEventListener('click', async () => {
      if (asset.referenced) return;
      if (!window.confirm('Delete this unused media file? This cannot be undone.')) return;
      deleteButton.disabled = true;
      try {
        await deleteMediaAsset(asset.key);
        setFeedback('Media deleted.', 'success');
        await refresh();
      } catch (error) {
        const code = error?.payload?.error;
        setFeedback(MEDIA_LIBRARY_ERRORS[code] || 'Unable to delete this media file.', 'error');
        deleteButton.disabled = false;
      }
    });

    actions.append(useButton, copyButton, deleteButton);
    body.append(meta, actions);
    card.append(body);
    return card;
  }

  async function refresh() {
    refreshButton?.setAttribute('disabled', '');
    setFeedback('Loading media…');
    try {
      const payload = await listMediaAssets();
      const assets = Array.isArray(payload?.assets) ? payload.assets : [];
      renderUsage(summary, progress, payload?.usage);
      list.replaceChildren();
      if (assets.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'media-library__empty';
        empty.textContent = 'No uploaded media yet. Upload a JPEG, PNG, WebP, or MP4 from the composer.';
        list.append(empty);
      } else {
        for (const asset of assets) list.append(renderAsset(asset, refresh));
      }
      setFeedback('');
      return payload;
    } catch (error) {
      console.error(error);
      list.replaceChildren();
      setFeedback('Unable to load the media library.', 'error');
      return null;
    } finally {
      refreshButton?.removeAttribute('disabled');
    }
  }

  refreshButton?.addEventListener('click', refresh);
  void refresh();
  return { refresh };
}
