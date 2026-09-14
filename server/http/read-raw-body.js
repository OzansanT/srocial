import { RequestBodyError } from './read-json-body.js';

export async function readRawBody(request, { limit = 1024 * 1024 } = {}) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new RequestBodyError('payload_too_large', 413);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
