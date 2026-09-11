export class MediaLibraryError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MediaLibraryError';
    this.code = code;
  }
}

export async function getReferencedMediaKeys(repository, mediaStore) {
  const records = await repository.listMedia();
  const keys = new Set();
  for (const record of records) {
    const key = mediaStore.keyFromUrl(record?.url);
    if (key) keys.add(key);
  }
  return keys;
}

export async function listMediaLibrary(repository, mediaStore) {
  const [assets, usage, referenced] = await Promise.all([
    mediaStore.list(),
    mediaStore.usage(),
    getReferencedMediaKeys(repository, mediaStore)
  ]);
  return {
    assets: assets.map((asset) => ({ ...asset, referenced: referenced.has(asset.key) })),
    usage
  };
}

export async function deleteMediaAsset(repository, mediaStore, key) {
  const referenced = await getReferencedMediaKeys(repository, mediaStore);
  if (referenced.has(String(key ?? ''))) throw new MediaLibraryError('MEDIA_IN_USE');
  await mediaStore.remove(key);
}
