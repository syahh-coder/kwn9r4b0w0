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

/** Dependency-injected internal flow. No database writes or publication authority.
 * @param {{extract: (...args: any[]) => Promise<any>, search: (...args: any[]) => Promise<any>, analyze: (...args: any[]) => Promise<any>, loadDocuments?: (...args: any[]) => Promise<any>, compare?: (...args: any[]) => Promise<any>, webSearch?: (...args: any[]) => Promise<any>}} options */
export function createClaimReviewPipeline({ extract, search, analyze, loadDocuments = undefined, compare = undefined, webSearch = undefined }) {
  return async function review(input, context = {}) {
    try {
      const extraction = await extract(input);
      if (extraction.status !== "extracted") return { status: extraction.status, stage: "extraction", draft: null };
      let result = await search(extraction.claim.text);
      if (!["available", "no_candidates"].includes(result.status)) return { status: "evidence_unavailable", stage: "retrieval", draft: null };
      if (webSearch) {
        if (typeof context.reserveWebSearch !== "function" || !(await context.reserveWebSearch())) return { status: "web_search_unavailable", draft: null };
        const indexed = result;
        result = await webSearch(extraction.claim.text, extraction.claim.searchQuery);
        if (!["available", "no_candidates"].includes(result.status)) return { status: "web_search_unavailable", draft: null };
        if (result.status === "no_candidates" && indexed.status === "available") result = indexed;
        if (result.documents?.length && compare) {
          const compared = await compare({ claim: extraction.claim.text, category: extraction.claim.category, sources: result.candidates, documents: result.documents });
          if (compared.status !== "compared") return { status: compared.status, stage: "comparison", draft: null };
          const sources = result.candidates.map(source => { const comparison = compared.comparisons.find(item => item.evidenceId === source.id);
            return comparison?.provenance ? { ...source, excerpt: comparison.quote, quoteSpan: comparison.provenance.span } : source; });
          const relations = { supports: "mendukung klaim menurut usulan model", contradicts: "bertentangan dengan klaim menurut usulan model", unclear: "belum menunjukkan hubungan bukti yang jelas" };
          return { status: "draft_ready", analysisAvailable: true, sources, extractedClaim: extraction.claim, evidenceComparison: compared,
            draft: { claim: extraction.claim.text, category: extraction.claim.category, verdict: "unverified", reviewStatus: "draft",
              summary: "Pencarian web dan pembandingan isi sumber selesai. Kesimpulan masih memerlukan tinjauan admin.",
              reason: compared.comparisons.map(item => `Sumber ${result.candidates.findIndex(source => source.id === item.evidenceId) + 1}: ${relations[item.relation]}.`).join(" ") + " Hubungan bukti serta kecocokan waktu, lokasi dan konteks belum disahkan admin.",
              evidenceIds: compared.comparisons.filter(item => item.provenance).map(item => item.evidenceId),
              limitations: ["Kutipan dicocokkan dengan teks yang dikembalikan penyedia, bukan jaminan kebenaran atau kecocokan konteks.",
                "Teks sumber dibatasi 12.000 karakter; tanggal yang tidak tersedia tidak diperkirakan.",
                ...(result.documents.length < result.candidates.length ? ["Sebagian tautan hanya menyediakan metadata; sumber tanpa isi tidak dipakai untuk pembandingan kutipan."] : [])] } };
        }
      }
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
