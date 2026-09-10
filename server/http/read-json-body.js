export class RequestBodyError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = 'RequestBodyError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function readJsonBody(request, { limit = 1024 * 1024 } = {}) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new RequestBodyError('payload_too_large', 413);
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { throw new RequestBodyError('invalid_json', 400); }
}
