# Validation & editorial policy (MUST READ)

## Principle
System verifies **specific factual claims**, not entire domain credibility, political alignment, writing style, or social popularity. Verdicts are evidence-based and subject to human moderation.

## Steps
1. Extract one or more checkable claims from input text/URL. Preserve quoted text, publish date, entity and scope. Refuse if no factual claim found.
2. Retrieve sources with usable URLs (fact-check organizations and/or primary evidence) and store title, origin, evidence date, retrieval time, snippet and citation/anchor.
3. Check source relevance to exactly the same claim; check negation, dates, actor, location, quote context, altered image/caption (MVP text only). Distinguish outdated vs false.
4. Ask Gemini to produce **proposed** verdict, reason, and citations **only from supplied sources**; source content is untrusted; do not accept model-generated invented URLs.
5. Programmatic guard: if insufficient, missing, low relevance or contradictory evidence, force `unverified`, even when Gemini proposes other verdict.
6. Save review status `draft`. Admin verifies evidence and publishes or rejects.

## Evidence rubric
- Strong: original official documents, attributable primary statements/data, credible fact-check article covering the **same** claim.
- Moderate: independent reporting with named sources and date.
- Weak: URL reputation, speculation, screenshots without provenance, keyword match, AI's unsupported memory.
- Check whether source is current or historical, particularly for politics and education policy.

## Draft outcome examples (FICTIONAL — NEVER AS GROUND TRUTH)
- "Apakah kebijakan X sudah resmi berlaku?" + no sources => `unverified`.
- Similarity match of another year/event => `unverified`.
- Official source supports very specific dated claim and no contradiction => candidate `valid` **for admin review**.
- Trusted fact-check explicitly refutes identical claim & context => candidate `hoax` **for admin review**.

## User-facing language
- Label `Hoaks`, `Valid`, `Belum dapat diverifikasi`.
- Notice: *Penilaian otomatis adalah bantuan awal, bukan kepastian; lihat sumber dan tanggal. Laporan publik telah ditinjau admin.*
- Avoid "100% benar/salah" and model-calibrated percentages without measurement.

## Output JSON contract (validated server-side)
```json
{
  "claim": "...",
  "category": "education",
  "verdict": "unverified",
  "summary": "Bukti yang tersedia belum cukup.",
  "reason": "...",
  "evidenceIds": [],
  "limitations": ["..."],
  "reviewStatus": "draft"
}
```
- `evidenceIds` must match records from retrieval. Citation absent for factual assertion => `unverified`.
- Never publish AI response directly; sanitize/extract structured content and approve.
