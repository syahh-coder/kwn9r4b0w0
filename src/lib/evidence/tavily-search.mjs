import { createHash } from "node:crypto";
import { safeSourceUrl } from "../reports/validation.mjs";
import { parseArticleUrl } from "../ingestion/url-policy.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const iso = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const identity = source => sha(JSON.stringify(["tavily-v1", source.url, source.claimText, source.contentHash]));

async function providerJson(response) {
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json") || !response.body) throw new Error("web_provider_unavailable");
  const reader = response.body.getReader(); const decoder = new TextDecoder("utf-8", { fatal: true }); let raw = ""; let bytes = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength;
    if (bytes > 512000) throw new Error("web_response_too_large"); raw += decoder.decode(value, { stream: true }); }
    return JSON.parse(raw + decoder.decode());
  } finally { void reader.cancel().catch(() => undefined); }
}

/** Validate provider content again at the persistence boundary. Raw article text
 * stays in memory; persist only a minimum excerpt, hash and literal UTF-16 span. */
export function webSourcePayload(source) {
  if (source?.provider !== "tavily" || source.contextVerified !== false || !safeSourceUrl(source.url)
    || typeof source.title !== "string" || !source.title.trim() || source.title.length > 1000
    || source.publisher !== new URL(source.url).hostname || source.publisher.length > 300
    || typeof source.claimText !== "string" || source.claimText.length < 20 || source.claimText.length > 1000
    || !iso(source.retrievedAt) || (source.publishedAt !== null && !iso(source.publishedAt))) throw new Error("invalid_web_source");
  parseArticleUrl(source.url);
  const hasText = typeof source.documentText === "string" && source.documentText.length >= 20 && source.documentText.length <= 12000;
  if (source.evidenceKind !== (hasText ? "web_source_content" : "web_search_metadata")
    || source.contentHash !== (hasText ? sha(source.documentText) : null) || source.id !== identity(source)) throw new Error("invalid_web_source");
  let span = null;
  if (source.excerpt != null) {
    span = source.quoteSpan;
    if (!hasText || typeof source.excerpt !== "string" || source.excerpt.length < 20 || source.excerpt.length > 1000
      || !Number.isInteger(span?.start) || !Number.isInteger(span?.end) || span.start < 0 || span.end > source.documentText.length
      || source.documentText.slice(span.start, span.end) !== source.excerpt) throw new Error("invalid_web_quote");
    const ranges = [...new Intl.Segmenter("id", { granularity: "sentence" }).segment(source.documentText)].map(s => ({
      start: s.index + s.segment.length - s.segment.trimStart().length, end: s.index + s.segment.trimEnd().length }));
    const first = ranges.findIndex(s => s.start === span.start);
    if (first < 0 || !ranges.slice(first, first + 3).some(s => s.end === span.end)
      || source.documentText.indexOf(source.excerpt) !== span.start || source.documentText.lastIndexOf(source.excerpt) !== span.start) throw new Error("invalid_web_quote");
  }
  return { candidate_key: source.id, provider: "tavily", source_url: source.url, source_title: source.title,
    source_domain: source.publisher, publisher: source.publisher, matched_claim: source.claimText,
    claimant: null, claim_date: null, review_date: null, collected_at: source.retrievedAt,
    original_rating: null, language_code: null, evidence_kind: source.evidenceKind,
    source_published_at: source.publishedAt, content_hash: source.contentHash,
    excerpt: source.excerpt || null, quote_start: span?.start ?? null, quote_end: span?.end ?? null };
}

function boundedSourceText(raw, claim, query) {
  if (raw.length <= 12000) return raw;
  const stop = new Set(["berdasarkan", "melalui", "masih", "berada", "dalam", "dengan", "adalah", "tersebut", "untuk", "that", "with", "from", "this", "than", "country", "report", "note", "official", "results"]);
  const terms = [...new Set(`${claim} ${query}`.toLocaleLowerCase("id-ID").match(/[\p{L}\p{N}]{4,}/gu) || [])].filter(term => !stop.has(term)).slice(0, 64);
  let best = 0; let bestScore = -1;
  for (let offset = 0; offset < raw.length; offset += 2000) {
    // Score local density, then retain a wider passage. Scoring the entire
    // 12k window let scattered navigation terms crowd out the actual article.
    const slice = raw.slice(offset, offset + 4000).toLocaleLowerCase("id-ID");
    const score = terms.reduce((sum, term) => sum + (slice.includes(term) ? (/^\d{4}$/.test(term) ? 3 : 1) : 0), 0);
    if (score > bestScore) { bestScore = score; best = offset; }
  }
  // Align both edges to original sentence boundaries. Otherwise a cropped last
  // sentence could silently omit a negation while looking complete to the model.
  const ranges = [...new Intl.Segmenter("id", { granularity: "sentence" }).segment(raw)]
    .map(s => ({ start: s.index, end: s.index + s.segment.length }));
  const start = ranges.findLast(s => s.start <= best)?.start ?? 0;
  const end = ranges.findLast(s => s.end <= start + 12000 && s.end > start)?.end ?? start;
  return raw.slice(start, end).trim();
}

export function normalizeWebResults(payload, claim, retrievedAt, query = claim) {
  if (!payload || !Array.isArray(payload.results) || payload.results.length > 20 || !iso(retrievedAt)) throw new Error("invalid_web_response");
  const sources = new Map();
  for (const result of payload.results.slice(0, 3)) {
    let url = safeSourceUrl(result?.url);
    try { if (url) url = parseArticleUrl(url).href; } catch { continue; }
    if (!url || sources.has(url) || typeof result.title !== "string" || !result.title.trim() || result.title.length > 1000) continue;
    const raw = typeof result.raw_content === "string" ? result.raw_content.trim() : "";
    const passage = raw.length >= 20 ? boundedSourceText(raw, claim, query) : "";
    const documentText = passage.length >= 20 ? passage : null;
    const source = { provider: "tavily", url, title: result.title.trim(), publisher: new URL(url).hostname,
      claimText: claim, claimDate: null, claimant: null, reviewDate: null, originalRating: null, languageCode: null,
      publishedAt: iso(result.published_date) ? result.published_date : null, retrievedAt,
      documentText, contentHash: documentText ? sha(documentText) : null, truncated: raw.length > 12000,
      evidenceKind: documentText ? "web_source_content" : "web_search_metadata", contextVerified: false };
    source.id = identity(source); webSourcePayload(source); sources.set(url, source);
  }
  // Source-of-record priority assists discovery, never determines a verdict.
  const primary = host => /(^|\.)(oecd\.org|worldbank\.org|unesco\.org|go\.id)$/.test(host);
  return [...sources.values()].sort((a, b) => Number(primary(b.publisher)) - Number(primary(a.publisher)));
}

/** Fixed provider endpoint. No direct fetch of returned URLs or snippet-as-proof.
 * @param {{enabled?: boolean, apiKey?: string, fetchImpl?: typeof fetch, now?: () => Date, loadArticle?: (url: string) => Promise<any>, extractMissing?: boolean}} [options] */
export function createTavilySearch({ enabled = false, apiKey, fetchImpl = fetch, now = () => new Date(), loadArticle, extractMissing = false } = {}) {
  return async function search(claim, query = claim) {
    const fail = status => ({ status, candidates: [], documents: [] });
    if (!enabled) return fail("disabled");
    if (!apiKey) return fail("not_configured");
    if (typeof claim !== "string" || claim.trim().length < 20 || claim.length > 1000) return fail("invalid_input");
    if (typeof query !== "string" || query.trim().length < 10 || query.length > 1000) return fail("invalid_input");
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl("https://api.tavily.com/search", { method: "POST", redirect: "error", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query: query.length <= 400 ? query : `${query.slice(0, 210)} ${query.slice(-180)}`,
          topic: "general", search_depth: "basic", max_results: 3, include_raw_content: "text", include_answer: false,
          include_images: false, auto_parameters: false, include_usage: true }) });
      if ([429, 432].includes(response.status)) return fail("rate_limited");
      if (!response.ok) return fail([401, 403].includes(response.status) ? "access_denied" : "unavailable");
      const payload = await providerJson(response); clearTimeout(timer);
      if (!payload || !Array.isArray(payload.results) || payload.results.length > 20) return fail("unavailable");
      if (extractMissing) {
        const urls = payload.results.slice(0, 3).filter(result => !(typeof result?.raw_content === "string" && result.raw_content.trim().length >= 20))
          .flatMap(result => { try { return [parseArticleUrl(result.url).href]; } catch { return []; } });
        if (urls.length) {
          try {
            const extracted = await providerJson(await fetchImpl("https://api.tavily.com/extract", { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({ urls, extract_depth: "basic", format: "text", include_images: false, include_usage: true, timeout: 5 }) }));
            if (Array.isArray(extracted?.results) && extracted.results.length <= 3) {
              payload.results = payload.results.slice(0, 3).map(result => { const match = extracted.results.find(item => item.url === result.url && urls.includes(item.url));
                return typeof match?.raw_content === "string" ? { ...result, raw_content: match.raw_content } : result; });
            }
          } catch { /* Preserve metadata and attempt only the reviewed safe client. */ }
        }
      }
      if (loadArticle) {
        payload.results = await Promise.all(payload.results.slice(0, 3).map(async result => {
          if (typeof result?.raw_content === "string" && result.raw_content.trim().length >= 20) return result;
          try {
            const url = parseArticleUrl(result?.url).href;
            const article = await loadArticle(url);
            return { ...result, url: article.sourceUrl, title: article.title || result.title, raw_content: article.text, published_date: article.publishedAt };
          } catch { return result; }
        }));
      }
      const candidates = normalizeWebResults(payload, claim, now().toISOString(), query);
      return { status: candidates.length ? "available" : "no_candidates", candidates,
        documents: candidates.filter(source => source.documentText).map(source => ({ evidenceId: source.id,
          sourceUrl: source.url, text: source.documentText, retrievedAt: source.retrievedAt })) };
    } catch { return fail("unavailable"); }
    finally { clearTimeout(timer); }
  };
}
