import "server-only";
import { createCheckService, requestSubject } from "./check-service.mjs";
import { createWorkerClient } from "./supabase/worker";
import { createClaimReviewPipeline } from "./analysis/claim-pipeline.mjs";
import { extractCandidateClaim, analyzeClaimFromMetadata, compareClaimWithEvidence } from "./analysis/server";
import { createTavilySearch } from "./evidence/tavily-search.mjs";
import { searchFactCheckCandidates } from "./evidence/server";
import { retrieveSubmittedArticle } from "./ingestion/server";

const enabled = process.env.PUBLIC_CHECK_ENABLED === "true" && process.env.GEMINI_ANALYSIS_ENABLED === "true"
  && process.env.FACTCHECK_SEARCH_ENABLED === "true" && Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL && process.env.GOOGLE_FACTCHECK_API_KEY);
const webEnabled = process.env.WEB_SEARCH_ENABLED === "true";
const reviewPipeline = createClaimReviewPipeline({ extract: extractCandidateClaim, search: searchFactCheckCandidates, analyze: analyzeClaimFromMetadata,
  compare: compareClaimWithEvidence, webSearch: webEnabled ? createTavilySearch({ enabled: true, apiKey: process.env.TAVILY_API_KEY, extractMissing: true, loadArticle: retrieveSubmittedArticle }) : undefined });
const diagnosticStatuses = new Set(["invalid_quote", "invalid_extraction", "invalid_search_query", "invalid_context", "invalid_comparison", "comparison_empty", "comparison_too_large", "comparison_invalid_json", "comparison_source_count", "invalid_citations", "invalid_evidence", "input_too_large", "model_timeout", "model_rate_limited", "model_unavailable", "model_not_found", "model_access_denied", "model_request_rejected", "not_configured", "disabled", "pipeline_unavailable", "evidence_unavailable", "web_search_unavailable"]);
const review: typeof reviewPipeline = async (...args) => {
  const result = await reviewPipeline(...args);
  if (!result.draft && result.status !== "no_factual_claim") {
    const stage = ["extraction", "retrieval", "comparison", "analysis"].includes(result.stage) ? result.stage : "pipeline";
    const status = diagnosticStatuses.has(result.status) ? result.status : "unavailable";
    // Fixed labels only: never log claims, provider responses, exception messages or credentials.
    console.warn(`cekfakta_check:${stage}:${status}`);
  }
  return result;
};
const check = createCheckService({ client: createWorkerClient(), review, retrieveArticle: retrieveSubmittedArticle,
  secret: process.env.CHECK_HASH_SECRET, model: process.env.GEMINI_MODEL, scope: process.env.CHECK_BUDGET_NAMESPACE || "public-v1",
  enabled, urlEnabled: process.env.PUBLIC_URL_CHECK_ENABLED === "true", policy: webEnabled ? "check-v2-tavily" : "check-v1" });
export const checkRequest = (payload: unknown, headers: Headers) => check(payload, requestSubject(headers, process.env.CHECK_TRUSTED_IP_HEADER));
export const checkAdminRequest = (payload: unknown, userId: string) => check(payload, `admin:${userId}`);
