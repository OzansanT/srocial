import { createLocalMediaStore } from './local-media-store.js';
import { createS3MediaStore } from './s3-media-store.js';
import { createS3RequestClient } from './s3-request.js';

const DEFAULT_MAX_BYTES = '52428800';
const DEFAULT_TOTAL_MAX_BYTES = '5368709120';

function isLoopbackHostname(hostname) {
  const normalized = String(hostname ?? '').toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]' || normalized === '::1';
}

function validateS3Endpoint(value) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error('MEDIA_S3_ENDPOINT_INVALID');
  }

  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && isLoopbackHostname(endpoint.hostname))) {
    throw new Error('MEDIA_S3_ENDPOINT_HTTPS_REQUIRED');
  }
  return endpoint.toString();
}

function requiredS3Config(env) {
  const values = {
    endpoint: String(env.MEDIA_S3_ENDPOINT ?? '').trim(),
    bucket: String(env.MEDIA_S3_BUCKET ?? '').trim(),
    accessKeyId: String(env.MEDIA_S3_ACCESS_KEY_ID ?? '').trim(),
    secretAccessKey: String(env.MEDIA_S3_SECRET_ACCESS_KEY ?? '').trim(),
    publicBaseUrl: String(env.MEDIA_PUBLIC_BASE_URL ?? '').trim()
  };
  if (Object.values(values).some((value) => !value)) throw new Error('MEDIA_S3_CONFIG_REQUIRED');
  values.endpoint = validateS3Endpoint(values.endpoint);
  return values;
}

export function createMediaStoreFromEnvironment({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const driver = String(env.MEDIA_STORAGE_DRIVER ?? 'local').trim().toLowerCase();
  const maxBytes = env.MEDIA_UPLOAD_MAX_BYTES ?? DEFAULT_MAX_BYTES;
  const totalMaxBytes = env.MEDIA_UPLOAD_TOTAL_MAX_BYTES ?? DEFAULT_TOTAL_MAX_BYTES;

  if (driver === 'local') {
    return createLocalMediaStore({
      rootDirectory: env.MEDIA_UPLOAD_DIR ?? './data/uploads',
      publicBaseUrl: env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:3000',
      maxBytes,
      totalMaxBytes
    });
  }

  if (driver !== 's3') throw new Error('MEDIA_STORAGE_DRIVER_UNSUPPORTED');

  const config = requiredS3Config(env);
  const requestClient = createS3RequestClient({
    region: String(env.MEDIA_S3_REGION ?? 'auto').trim() || 'auto',
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    fetchImpl,
    now
  });

  return createS3MediaStore({
    endpoint: config.endpoint,
    bucket: config.bucket,
    prefix: env.MEDIA_S3_PREFIX ?? 'media/',
    publicBaseUrl: config.publicBaseUrl,
    maxBytes,
    totalMaxBytes,
    requestClient
  });
}
