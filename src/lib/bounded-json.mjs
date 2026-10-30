export class JsonInputError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export async function readBoundedJson(request, { maxBytes = 22000, timeoutMs = 5000 } = {}) {
  if (!request.body) throw new JsonInputError("invalid_json");
  const reader = request.body.getReader();
  let timer;
  const read = async () => {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let raw = ""; let bytes = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new JsonInputError("payload_too_large");
      raw += decoder.decode(value, { stream: true });
    }
    return JSON.parse(raw + decoder.decode());
  };
  try {
    return await Promise.race([read(), new Promise((_, reject) => {
      timer = setTimeout(() => { reject(new JsonInputError("request_timeout")); void reader.cancel().catch(() => undefined); }, timeoutMs);
    })]);
  } catch (error) {
    if (error instanceof JsonInputError) throw error;
    throw new JsonInputError("invalid_json");
  } finally { clearTimeout(timer); void reader.cancel().catch(() => undefined); }
}
