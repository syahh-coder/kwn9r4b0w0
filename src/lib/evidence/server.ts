import "server-only";
import { createFactCheckSearch } from "./google-fact-check.mjs";
import { persistReportCandidates } from "./source-repository.mjs";
import { getAdminAccess } from "@/lib/admin-auth";

// Deliberate activation after provider quota/terms review. Never reuse Gemini key implicitly.
export const searchFactCheckCandidates = createFactCheckSearch({
  apiKey: process.env.GOOGLE_FACTCHECK_API_KEY,
  enabled: process.env.FACTCHECK_SEARCH_ENABLED === "true",
});

// Internal orchestration for an existing draft; no public route or auto-publication.
export async function searchAndStoreReportCandidates(reportId: string, query: string) {
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return { status: "invalid_report" };
  const access = await getAdminAccess();
  if (access.status !== 200) return { status: access.status === 503 ? "unavailable" : "forbidden" };
  const report = await access.supabase.from("reports").select("id,review_status").eq("id", reportId).maybeSingle();
  if (report.error) return { status: "unavailable" };
  if (!report.data || report.data.review_status !== "draft") return { status: "invalid_report" };
  const result = await searchFactCheckCandidates(query);
  if (!["available", "no_candidates"].includes(result.status)) return result;
  try {
    const stored = await persistReportCandidates(access.supabase, reportId, result.candidates);
    return { status: "stored", searchStatus: result.status, ...stored };
  } catch { return { status: "storage_unavailable" }; }
}
