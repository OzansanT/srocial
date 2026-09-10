export async function requestJson(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  headers.set('accept', 'application/json');
  const response = await fetch(path, { ...options, headers });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(`Request failed: ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}
