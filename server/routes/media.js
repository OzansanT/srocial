import { deleteMediaAsset, listMediaLibrary, MediaLibraryError } from '../services/media-library-service.js';

export async function listMediaPayload(repository, mediaStore) {
  return { statusCode: 200, payload: await listMediaLibrary(repository, mediaStore) };
}

export async function deleteMediaPayload(repository, mediaStore, key) {
  try {
    await deleteMediaAsset(repository, mediaStore, key);
    return { statusCode: 204, payload: null };
  } catch (error) {
    if (error instanceof MediaLibraryError && error.code === 'MEDIA_IN_USE') {
      return { statusCode: 409, payload: { error: 'media_in_use' } };
    }
    throw error;
  }
}
