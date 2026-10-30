import { sourcePayload } from "../evidence/source-repository.mjs";
import { validateDraft } from "./validation.mjs";

/** Internal sink for policy-guarded analysis. Never accept a proposed model verdict. */
export function buildAnalysisDocument(result) {
  const draft = result?.draft;
  if (!["draft_ready", "no_evidence"].includes(result?.status) || draft?.reviewStatus !== "draft" || draft?.verdict !== "unverified"
    || !Array.isArray(draft.limitations) || !draft.limitations.every(item => typeof item === "string")
    || !Array.isArray(draft.evidenceIds) || !Array.isArray(result.sources)) throw new Error("invalid_analysis_draft");
  const candidates = sourcePayload(result.sources);
  const ids = new Set(candidates.map(source => source.candidate_key));
  if (draft.evidenceIds.some(id => !ids.has(id))) throw new Error("invalid_analysis_draft");
  const document = validateDraft({ claim: draft.claim, category: draft.category, verdict: "unverified", summary: draft.summary,
    reasoning: draft.reason, adminNotes: draft.limitations.join("\n"), sources: [] }, true);
  if (!document) throw new Error("invalid_analysis_draft");
  return { ...document, candidates };
}
export async function saveAnalysisDraft(client, result) {
  const document = buildAnalysisDocument(result);
  // Sources and limitations are committed together with the report, or rolled back.
  const { data, error } = await client.rpc("save_report_draft", { p_id: null, p_expected: null, p_document: document });
  if (error || !data?.id) throw new Error("draft_save_failed");
  return data;
}
