import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { IngestionError, isPublicAddress, parseArticleUrl, resolveArticleTarget } from "./url-policy.mjs";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const TYPES = new Set(["text/html", "application/xhtml+xml", "text/plain"]);
const MAX_BYTES = 512_000;

/** A fresh connection pins the selected public IP while preserving Host and TLS SNI.
 * requestImpl is solely a test seam. Never pass a user-supplied transport or headers.
 */
export function requestPinned(url, target, { signal, maxBytes = MAX_BYTES, requestImpl } = {}) {
  if (!isPublicAddress(target.address)) return Promise.reject(new IngestionError("fetch_blocked"));
  const request = requestImpl || (url.protocol === "https:" ? httpsRequest : httpRequest);
  return new Promise((resolve, reject) => {
    const req = request(url, {
      agent: false, signal, maxHeaderSize: 16_384, family: target.family,
      // A second DNS lookup cannot change the destination after validation.
      lookup(_hostname, options, callback) {
        if (options.all) callback(null, [{ address: target.address, family: target.family }]);
        else callback(null, target.address, target.family);
      },
      headers: { Accept: "text/html, application/xhtml+xml, text/plain", "Accept-Encoding": "identity", "User-Agent": "CekFakta/0.1 (article retrieval)" },
    }, response => {
      const fail = code => { response.destroy(); reject(new IngestionError(code)); };
      const status = response.statusCode || 0;
      if (REDIRECTS.has(status)) {
        const location = response.headers.location;
        response.destroy();
        if (typeof location !== "string" || !location || location.length > 2000) reject(new IngestionError("fetch_blocked"));
        else resolve({ status, location });
        return;
      }
      if (status !== 200) { fail("source_unavailable"); return; }
      const contentType = response.headers["content-type"];
      if (typeof contentType !== "string" || !TYPES.has(contentType.split(";")[0].trim().toLowerCase())) { fail("unsupported_content"); return; }
      const charset = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1]?.toLowerCase();
      if (charset && !["utf-8", "utf8", "us-ascii"].includes(charset)) { fail("unsupported_content"); return; }
      const encoding = response.headers["content-encoding"];
      if (encoding && encoding.toLowerCase() !== "identity") { fail("unsupported_content"); return; }
      const length = response.headers["content-length"];
      if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) { fail("content_too_large"); return; }
      const chunks = [];
      let total = 0;
      response.on("data", chunk => {
        const bytes = Buffer.from(chunk);
        total += bytes.length;
        if (total > maxBytes) { fail("content_too_large"); return; }
        chunks.push(bytes);
      });
      response.on("end", () => {
        if (!response.complete) { reject(new IngestionError("source_unavailable")); return; }
        try {
          const body = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
          resolve({ status, contentType: contentType.split(";")[0].trim().toLowerCase(), body });
        } catch { reject(new IngestionError("unsupported_content")); }
      });
      response.on("error", () => reject(new IngestionError(signal?.aborted ? "fetch_timeout" : "source_unavailable")));
      response.on("aborted", () => reject(new IngestionError(signal?.aborted ? "fetch_timeout" : "source_unavailable")));
    });
    req.on("error", () => reject(new IngestionError(signal?.aborted ? "fetch_timeout" : "source_unavailable")));
    req.end();
  });
}

/** Server-only Node transport. No public URL ingestion until shared rate-limit/review. */
export function createArticleFetcher({ resolver = lookup, transport = requestPinned, timeoutMs = 8000, maxBytes = MAX_BYTES, maxRedirects = 3 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000 || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES || !Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 3) throw new Error("invalid_fetch_limits");
  return async function fetchArticle(input) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let next = input;
    let previous;
    const seen = new Set();
    try {
      for (let hop = 0; hop <= maxRedirects; hop++) {
        const url = parseArticleUrl(next, previous);
        if (previous?.protocol === "https:" && url.protocol === "http:") throw new IngestionError("fetch_blocked");
        if (seen.has(url.href)) throw new IngestionError("redirect_limit");
        seen.add(url.href);
        const target = await resolveArticleTarget(url, resolver, controller.signal);
        if (controller.signal.aborted) throw new IngestionError("fetch_timeout");
        const response = await transport(url, target, { signal: controller.signal, maxBytes });
        if (!REDIRECTS.has(response.status)) return { ...response, finalUrl: url.href, retrievedAt: new Date().toISOString() };
        if (hop === maxRedirects) throw new IngestionError("redirect_limit");
        previous = url; next = response.location;
      }
    } catch (error) {
      if (controller.signal.aborted) throw new IngestionError("fetch_timeout");
      if (error instanceof IngestionError) throw error;
      throw new IngestionError("source_unavailable");
    } finally { clearTimeout(timer); }
  };
}
