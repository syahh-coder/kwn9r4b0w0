/** Shared input shape validation; network, quota and persistence live on the server.
 * This does NOT fetch URLs or determine whether a claim is true/false.
 * NEVER treat URL syntax screening here as full SSRF protection.
 */
export const CATEGORIES = Object.freeze(["education", "politics", "conservation"]);
export const INPUT_TYPES = Object.freeze(["text", "url"]);

/** @param {unknown} payload */
export function parseCheckInput(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, reason: "Format data tidak valid." };
  }
  const obj = /** @type {Record<string, unknown>} */ (payload);
  if (Object.keys(obj).some(key => !["inputType", "input", "category"].includes(key))) return { ok: false, reason: "Kolom input tidak dikenali." };
  if (typeof obj.category !== "string" || !CATEGORIES.includes(obj.category)) {
    return { ok: false, reason: "Pilih topik yang tersedia." };
  }
  if (typeof obj.inputType !== "string" || !INPUT_TYPES.includes(obj.inputType)) {
    return { ok: false, reason: "Pilih jenis input Teks atau URL." };
  }
  if (typeof obj.input !== "string") {
    return { ok: false, reason: "Isi berita harus berupa teks." };
  }
  const input = obj.input.trim();
  if (obj.inputType === "text") {
    if (input.length < 20 || input.length > 5000) {
      return { ok: false, reason: "Teks berita harus 20–5.000 karakter." };
    }
  } else {
    if (input.length > 2000 || !input) {
      return { ok: false, reason: "Panjang URL harus 1–2.000 karakter." };
    }
    try {
      const parsed = new URL(input);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
        return { ok: false, reason: "Gunakan URL HTTP/HTTPS tanpa informasi login." };
      }
      if (!parsed.hostname.includes(".") || /^(localhost|.+\.localhost)$/i.test(parsed.hostname)) {
        return { ok: false, reason: "Gunakan URL situs publik yang valid." };
      }
    } catch {
      return { ok: false, reason: "Format URL tidak valid." };
    }
  }
  return { ok: true, value: { input, inputType: obj.inputType, category: obj.category } };
}
