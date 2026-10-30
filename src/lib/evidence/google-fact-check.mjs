import { createHash } from "node:crypto";
import { isIP } from "node:net";

const ENDPOINT = "https://factchecktools.googleapis.com/v1alpha1/claims:search";
const MAX_BYTES = 256_000;
const text = (value, max) => typeof value === "string" && value.trim().length <= max ? value.trim() : "";
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function timestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}

function reviewUrl(value) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    // Metadata screening only, NOT SSRF-safe DNS validation. Never fetch these URLs here.
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port
      || isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".")
      || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

/** Normalize untrusted provider metadata; never infer a verdict or source relevance. */
export function normalizeFactCheckResponse(payload, retrievedAt) {
  if (!object(payload) || (payload.claims !== undefined && !Array.isArray(payload.claims))) throw new Error("invalid_response");
  if (payload.claims?.length > 50) throw new Error("invalid_response");
  const candidates = new Map();
  for (const claim of payload.claims || []) {
    if (!object(claim)) continue;
    const claimText = text(claim.text, 5000);
    if (!claimText || !Array.isArray(claim.claimReview)) continue;
    for (const review of claim.claimReview.slice(0, 10)) {
      if (!object(review)) continue;
      const url = reviewUrl(review.url);
      const title = text(review.title, 1000);
      const publisher = object(review.publisher) ? text(review.publisher.name, 300) : "";
      if (!url || !title || !publisher) continue;
      const claimDate = timestamp(claim.claimDate);
      const reviewDate = timestamp(review.reviewDate);
      const claimant = text(claim.claimant, 300) || null;
      const id = createHash("sha256").update(JSON.stringify([url, claimText, claimant, claimDate, reviewDate])).digest("hex");
      if (!candidates.has(id)) candidates.set(id, {
        id, provider: "google_fact_check", claimText, claimant,
        claimDate, url, title, publisher, sourceDomain: new URL(url).hostname,
        reviewDate, retrievedAt, originalRating: text(review.textualRating, 300) || null,
        languageCode: text(review.languageCode, 35) || null,
        evidenceKind: "claim_review_metadata", contextVerified: false,
      });
      if (candidates.size >= 20) return [...candidates.values()];
    }
  }
  return [...candidates.values()];
}

async function boundedJson(response) {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json") || !response.body) throw new Error("invalid_response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let raw = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new Error("response_too_large");
      raw += decoder.decode(value, { stream: true });
    }
    return JSON.parse(raw + decoder.decode());
  } finally { void reader.cancel().catch(() => undefined); }
}

/** Server provider; the check service calls it after shared quota/lease reservation.
 * fetchImpl injection is for tests only; endpoint is fixed and redirects are rejected.
 * Cache/in-flight dedupe is per process, NOT a distributed quota/rate limit.
 * @param {{apiKey?: string, enabled?: boolean, fetchImpl?: typeof fetch, now?: () => number}} [options]
 */
export function createFactCheckSearch({ apiKey, enabled = false, fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async function search(query) {
    const empty = status => ({ status, candidates: [] });
    if (!enabled) return empty("disabled");
    if (typeof apiKey !== "string" || !apiKey.trim()) return empty("not_configured");
    if (typeof query !== "string" || query.trim().length < 20 || query.trim().length > 1000) return empty("invalid_input");
    // Preserve case, dates, punctuation and negation; normalize whitespace only.
    const normalized = query.trim().replace(/\s+/g, " ");
    const key = createHash("sha256").update(normalized).digest("hex");
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now()) return structuredClone(hit.value);
    cache.delete(key);
    if (pending.has(key)) return structuredClone(await pending.get(key));
    if (pending.size >= 10) return empty("busy");
    const work = (async () => {
      try {
        const url = new URL(ENDPOINT);
        url.searchParams.set("query", normalized);
        url.searchParams.set("languageCode", "id");
        url.searchParams.set("pageSize", "5");
        const response = await fetchImpl(url, {
          method: "GET", redirect: "error", signal: AbortSignal.timeout(8000),
          headers: { "X-Goog-Api-Key": apiKey, Accept: "application/json" },
        });
        if (!response.ok) {
          void response.body?.cancel().catch(() => undefined);
          return empty(response.status === 429 ? "rate_limited" : "unavailable");
        }
        const candidates = normalizeFactCheckResponse(await boundedJson(response), new Date(now()).toISOString());
        const value = { status: candidates.length ? "available" : "no_candidates", candidates };
        // Bounded five-minute metadata cache; failures are not cached or retried.
        if (cache.size >= 128) cache.delete(cache.keys().next().value);
        cache.set(key, { value, expiresAt: now() + 300_000 });
        return value;
      } catch { return empty("unavailable"); }
    })();
    pending.set(key, work);
    try { return structuredClone(await work); } finally { pending.delete(key); }
  };
}
