import { safeSourceUrl, validId, categories } from "./reports/validation.mjs";
export function parseCheckResult(body) {
  if (!body || body.mode !== "analysis" || !validId(body.id) || body.verdict !== "unverified" || body.reviewStatus !== "draft"
    || typeof body.analysisAvailable !== "boolean" || typeof body.cached !== "boolean" || !Object.hasOwn(categories, body.category)
    || typeof body.claim !== "string" || body.claim.length > 5000 || typeof body.summary !== "string" || body.summary.length > 3000
    || typeof body.reason !== "string" || body.reason.length > 8000 || typeof body.notice !== "string" || body.notice.length > 500
    || !Array.isArray(body.limitations) || body.limitations.length > 8 || body.limitations.some(item => typeof item !== "string" || item.length > 500)
    || !Array.isArray(body.sources) || body.sources.length > 10) return null;
  const sources = [];
  for (const source of body.sources) {
    const url = safeSourceUrl(source?.url);
    if (!url || typeof source.title !== "string" || source.title.length > 1000 || typeof source.publisher !== "string" || source.publisher.length > 300
      || (source.reviewedAt !== null && (typeof source.reviewedAt !== "string" || !Number.isFinite(Date.parse(source.reviewedAt))))) return null;
    if (source.excerpt != null && (typeof source.excerpt !== "string" || source.excerpt.length > 1000)) return null;
    if (source.publishedAt != null && (typeof source.publishedAt !== "string" || !Number.isFinite(Date.parse(source.publishedAt)))) return null;
    if (source.kind != null && !["claim_review_metadata", "web_source_content", "web_search_metadata"].includes(source.kind)) return null;
    sources.push({ url, title: source.title, publisher: source.publisher, reviewedAt: source.reviewedAt,
      publishedAt: source.publishedAt ?? null, excerpt: source.excerpt ?? null, kind: source.kind ?? "claim_review_metadata" });
  }
  const limitations = /** @type {string[]} */ (body.limitations);
  return { id: body.id, claim: body.claim, category: body.category, verdict: "unverified", reviewStatus: "draft", summary: body.summary,
    reason: body.reason, analysisAvailable: body.analysisAvailable, cached: body.cached, limitations, notice: body.notice, sources };
}
