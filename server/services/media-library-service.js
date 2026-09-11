export class MediaLibraryError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MediaLibraryError';
    this.code = code;
  }
}

function mediaKeyFromUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    const match = url.pathname.match(/^\/media\/([^/]+)$/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

async function referencedKeys(repository) {
  const records = await repository.listMedia();
  const keys = new Set();
  for (const record of records) {
    const key = mediaKeyFromUrl(record?.url);
    if (key) keys.add(key);
  }
  return keys;
}

export async function listMediaLibrary(repository, mediaStore) {
  const [assets, usage, referenced] = await Promise.all([
    mediaStore.list(),
    mediaStore.usage(),
    referencedKeys(repository)
  ]);
  return {
    assets: assets.map((asset) => ({ ...asset, referenced: referenced.has(asset.key) })),
    usage
  };
}

export async function deleteMediaAsset(repository, mediaStore, key) {
  const referenced = await referencedKeys(repository);
  if (referenced.has(String(key ?? ''))) throw new MediaLibraryError('MEDIA_IN_USE');
  await mediaStore.remove(key);
}
