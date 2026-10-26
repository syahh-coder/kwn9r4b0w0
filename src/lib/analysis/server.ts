import "server-only";
import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";
import { createEvidenceAnalyzer } from "./evidence-analysis.mjs";
import { createClaimExtractor } from "./claim-extraction.mjs";
import { createClaimReviewPipeline } from "./claim-pipeline.mjs";
import { searchFactCheckCandidates } from "@/lib/evidence/server";
import { getAdminAccess } from "@/lib/admin-auth";
import { createEvidenceComparator } from "./evidence-comparison.mjs";

const apiKey = process.env.GEMINI_API_KEY;
async function generate(request: object) {
  const client = new GoogleGenAI({ apiKey, vertexai: false, httpOptions: { timeout: 15000, retryOptions: { attempts: 1 } } });
  const response = await client.models.generateContent(request as GenerateContentParameters);
  return { text: response.text };
}
// No implicit model fallback: model availability/quota must be checked explicitly.
export const analyzeClaimFromMetadata = createEvidenceAnalyzer({
  enabled: process.env.GEMINI_ANALYSIS_ENABLED === "true",
  apiKey, model: process.env.GEMINI_MODEL,
  generate,
});

export const extractCandidateClaim = createClaimExtractor({
  enabled: process.env.GEMINI_ANALYSIS_ENABLED === "true", apiKey, model: process.env.GEMINI_MODEL, generate,
});
export const compareClaimWithEvidence = createEvidenceComparator({
  enabled: process.env.GEMINI_ANALYSIS_ENABLED === "true", apiKey, model: process.env.GEMINI_MODEL, generate,
});
const reviewText = createClaimReviewPipeline({ extract: extractCandidateClaim, search: searchFactCheckCandidates, analyze: analyzeClaimFromMetadata });

// Admin draft workflow entry point. Guard before any model/retrieval spend.
export async function reviewTextForAdmin(text: string, category: string) {
  const access = await getAdminAccess();
  if (access.status !== 200) return { status: access.status === 503 ? "unavailable" : "forbidden", draft: null };
  if (process.env.FACTCHECK_SEARCH_ENABLED !== "true" || !process.env.GOOGLE_FACTCHECK_API_KEY) return { status: "evidence_unavailable", draft: null };
  return reviewText({ text, category });
}
