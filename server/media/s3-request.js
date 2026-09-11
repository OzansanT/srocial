import { MediaStoreError } from './media-format.js';
import { signS3Request } from './s3-signer.js';

function statusErrorCode(status) {
  if (status === 404) return 'MEDIA_NOT_FOUND';
  if (status === 401 || status === 403) return 'MEDIA_STORAGE_AUTH_ERROR';
  if (status === 429 || status >= 500) return 'MEDIA_STORAGE_UNAVAILABLE';
  return 'MEDIA_STORAGE_ERROR';
}

function safeFetchHeaders(signedHeaders) {
  const headers = { ...signedHeaders };
  delete headers.host;
  return headers;
}

export function createS3RequestClient({ region, accessKeyId, secretAccessKey, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('MEDIA_S3_FETCH_REQUIRED');

  return {
    async request({ method = 'GET', url, headers = {}, body = undefined, payloadHash } = {}) {
      const target = url instanceof URL ? new URL(url.toString()) : new URL(String(url ?? ''));
      const signedHeaders = signS3Request({
        method,
        url: target,
        region,
        accessKeyId,
        secretAccessKey,
        headers,
        payloadHash,
        now: now()
      });

      let response;
      try {
        response = await fetchImpl(target, {
          method: String(method).toUpperCase(),
          headers: safeFetchHeaders(signedHeaders),
          body
        });
      } catch {
        throw new MediaStoreError('MEDIA_STORAGE_UNAVAILABLE');
      }

      if (!response.ok) throw new MediaStoreError(statusErrorCode(response.status));
      return response;
    }
  };
}
