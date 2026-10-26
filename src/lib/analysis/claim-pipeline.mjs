/** Mechanical context flags, never proof of semantic match/contradiction.
 * Negative wording can be relevant rebuttal; flagged candidates are not discarded.
 */
export function inspectCandidateContext(claim, candidate) {
  const years = text => [...new Set(text.match(/\b(?:19|20)\d{2}\b/g) || [])];
  const leftYears = years(claim.text);
  const rightYears = years(candidate.claimText);
  const normalize = text => text.normalize("NFC").toLocaleLowerCase("id-ID");
  const negation = text => /\b(tidak|bukan|belum|tak|tanpa)\b/iu.test(text);
  const flags = [];
  if (leftYears.length && rightYears.length && (leftYears.some(year => !rightYears.includes(year)) || rightYears.some(year => !leftYears.includes(year)))) flags.push("year_difference");
  if (negation(claim.text) !== negation(candidate.claimText)) flags.push("negation_difference");
  for (const key of ["subject", "location"]) {
    if (!claim[key]) flags.push(`${key}_unknown`);
    else if (!normalize(candidate.claimText).includes(normalize(claim[key]))) flags.push(`${key}_not_explicit`);
  }
  if (!claim.time) flags.push("time_unknown");
  else if (!leftYears.length) flags.push("time_requires_interpretation");
  return { evidenceId: candidate.id, flags, contextVerified: false, requiresReview: true };
}

/** Dependency-injected internal flow. No database writes or publication authority. */
export function createClaimReviewPipeline({ extract, search, analyze, loadDocuments = undefined, compare = undefined }) {
  return async function review(input) {
    try {
      const extraction = await extract(input);
      if (extraction.status !== "extracted") return { status: extraction.status, stage: "extraction", draft: null };
      const result = await search(extraction.claim.text);
      if (!["available", "no_candidates"].includes(result.status)) return { status: "evidence_unavailable", stage: "retrieval", draft: null };
      let comparison = { status: "no_evidence_text", comparisons: [] };
      if (result.candidates.length && loadDocuments && compare) {
        const documents = await loadDocuments(result.candidates);
        comparison = await compare({ claim: extraction.claim.text, category: extraction.claim.category, sources: result.candidates, documents });
        if (!["compared", "no_evidence_text"].includes(comparison.status)) return { status: comparison.status, stage: "comparison", draft: null };
      }
      const analysis = await analyze({ claim: extraction.claim.text, category: extraction.claim.category, sources: result.candidates, evidenceStatus: result.status });
      if (!analysis.draft) return { status: analysis.status, stage: "analysis", draft: null };
      if (comparison.status === "compared") {
        const quotedIds = comparison.comparisons.filter(item => item.provenance).map(item => item.evidenceId);
        analysis.draft = { ...analysis.draft,
          reason: "Isi sumber telah dibandingkan, tetapi hubungan bukti dan kecocokan konteks masih merupakan usulan model yang memerlukan tinjauan admin.",
          evidenceIds: analysis.draft.evidenceIds.filter(id => quotedIds.includes(id)),
          limitations: [...analysis.draft.limitations, "Kutipan yang ada dalam sumber bukan jaminan bahwa konteks dan kesimpulan model sudah benar."],
        };
        analysis.policy = { ...analysis.policy, reason: "editorial_review_required" };
      }
      return { ...analysis, sources: result.candidates, evidenceComparison: comparison, extractedClaim: extraction.claim, contextChecks: result.candidates.map(candidate => inspectCandidateContext(extraction.claim, candidate)) };
    } catch { return { status: "pipeline_unavailable", draft: null }; }
  };
}
