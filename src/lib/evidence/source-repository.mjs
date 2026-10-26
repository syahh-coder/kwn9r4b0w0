import { normalizeFactCheckResponse } from "./google-fact-check.mjs";

export class SourcePersistenceError extends Error {
  constructor(code) { super(code); this.name = "SourcePersistenceError"; this.code = code; }
}

/** Revalidate untrusted metadata at the write boundary; omit all verdict/workflow fields. */
export function sourcePayload(candidates) {
  if (!Array.isArray(candidates) || candidates.length > 20) throw new SourcePersistenceError("invalid_candidates");
  const rows = new Map();
  for (const candidate of candidates) {
    if (!candidate || candidate.provider !== "google_fact_check" || candidate.evidenceKind !== "claim_review_metadata" || candidate.contextVerified !== false
      || typeof candidate.retrievedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(candidate.retrievedAt) || !Number.isFinite(Date.parse(candidate.retrievedAt))) throw new SourcePersistenceError("invalid_candidates");
    const normalized = normalizeFactCheckResponse({ claims: [{
      text: candidate.claimText, claimant: candidate.claimant, claimDate: candidate.claimDate,
      claimReview: [{ url: candidate.url, title: candidate.title, publisher: { name: candidate.publisher }, reviewDate: candidate.reviewDate, textualRating: candidate.originalRating, languageCode: candidate.languageCode }],
    }] }, candidate.retrievedAt)[0];
    if (!normalized || normalized.id !== candidate.id || normalized.claimDate !== candidate.claimDate || normalized.reviewDate !== candidate.reviewDate) throw new SourcePersistenceError("invalid_candidates");
    rows.set(normalized.id, {
      candidate_key: normalized.id, provider: normalized.provider,
      source_url: normalized.url, source_title: normalized.title, source_domain: normalized.sourceDomain,
      publisher: normalized.publisher, matched_claim: normalized.claimText, claimant: normalized.claimant,
      claim_date: normalized.claimDate, review_date: normalized.reviewDate,
      collected_at: normalized.retrievedAt, original_rating: normalized.originalRating,
      language_code: normalized.languageCode, evidence_kind: normalized.evidenceKind,
    });
  }
  return [...rows.values()];
}

/** Single RPC transaction: all candidates attach or none do. RLS remains authoritative.
 * The caller supplies a user-scoped server client, not credentials from public input.
 */
export async function persistReportCandidates(client, reportId, candidates) {
  if (typeof reportId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId)) throw new SourcePersistenceError("invalid_report");
  const payload = sourcePayload(candidates);
  try {
    const { data, error } = await client.rpc("attach_report_candidates", { p_report_id: reportId, p_candidates: payload });
    if (error) throw new SourcePersistenceError(error.code === "42501" ? "source_write_denied" : "source_write_failed");
    if (!Number.isInteger(data) || data < 0 || data > payload.length) throw new SourcePersistenceError("source_write_failed");
    return { insertedCount: data, candidateCount: payload.length };
  } catch (error) {
    if (error instanceof SourcePersistenceError) throw error;
    throw new SourcePersistenceError("source_write_failed");
  }
}
