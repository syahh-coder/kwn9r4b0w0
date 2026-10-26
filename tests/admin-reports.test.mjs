import test from "node:test";
import assert from "node:assert/strict";
import { validateDraft, validateAction, safeSourceUrl } from "../src/lib/reports/validation.mjs";
import { saveAnalysisDraft } from "../src/lib/reports/analysis-draft.mjs";
import { normalizeFactCheckResponse } from "../src/lib/evidence/google-fact-check.mjs";

const version = "2026-10-24T01:02:03.123456+00:00";
const draft = () => ({ claim: "Klaim fiktif untuk pengujian editorial.", category: "education", verdict: "unverified", summary: "Ringkasan fixture.", reasoning: "Alasan fixture, bukan hasil verifikasi nyata.", adminNotes: "Catatan privat fixture.", sources: [{ url: "https://example.org/fixture", title: "Sumber fiktif", excerpt: "Kutipan fixture.", publishedAt: null }] });
test("draft validator rejects mass assignment, publication and unsupported metadata", () => {
  assert.ok(validateDraft(draft(), true));
  assert.ok(validateDraft({ ...draft(), expectedUpdatedAt: version }));
  for (const mutation of [{ verdict: "valid" }, { review_status: "published" }, { published_by: "forged" }, { candidates: [] }, { expectedUpdatedAt: version }]) assert.equal(validateDraft({ ...draft(), ...mutation }, true), null);
  for (const mutation of [{ claim: "short" }, { category: "other" }, { verdict: "other" }, { expectedUpdatedAt: "yesterday" }, { adminNotes: "a".repeat(5001) }, { sources: Array(21).fill(draft().sources[0]) }]) assert.equal(validateDraft({ ...draft(), expectedUpdatedAt: version, ...mutation }), null);
  assert.equal(validateDraft(null), null);
});
test("source URLs, lengths, timestamps and nested mass assignment are constrained", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,x", "http://127.0.0.1/", "https://user:pass@example.org/", "https://x.internal/"]) {
    assert.equal(safeSourceUrl(url), null);
    assert.equal(validateDraft({ ...draft(), sources: [{ ...draft().sources[0], url }] }, true), null);
  }
  for (const mutation of [{ title: "" }, { excerpt: "x".repeat(2001) }, { publishedAt: "invalid" }, { report_id: "forged" }]) assert.equal(validateDraft({ ...draft(), sources: [{ ...draft().sources[0], ...mutation }] }, true), null);
});
test("publish requires explicit review and all actions carry optimistic version", () => {
  assert.ok(validateAction({ action: "publish", expectedUpdatedAt: version, reviewed: true }));
  assert.ok(validateAction({ action: "reject", expectedUpdatedAt: version }));
  for (const mutation of [{ reviewed: false }, { reviewed: "true" }, { expectedUpdatedAt: undefined }, { action: "delete" }, { published_by: "forged" }]) assert.equal(validateAction({ action: "publish", expectedUpdatedAt: version, reviewed: true, ...mutation }), null);
});
test("analysis persistence stores final unverified and provenance in one RPC, ignores model proposal", async () => {
  const sources = normalizeFactCheckResponse({ claims: [{ text: draft().claim, claimReview: [{ url: "https://example.org/fixture", title: "Fixture", publisher: { name: "Penerbit fiktif" } }] }] }, version);
  const result = { status: "draft_ready", sources, proposedAnalysis: { verdict: "valid", reviewStatus: "published" }, draft: { claim: draft().claim, category: "education", verdict: "unverified", reviewStatus: "draft", summary: "Fixture.", reason: "Bukti belum cukup.", limitations: ["Metadata belum dibandingkan."], evidenceIds: [sources[0].id] } };
  let calls = 0;
  const client = { rpc: async (name, args) => {
    calls++; assert.equal(name, "save_report_draft"); assert.equal(args.p_id, null); assert.equal(args.p_document.verdict, "unverified");
    assert.equal(args.p_document.candidates[0].candidate_key, sources[0].id);
    assert.equal("proposedAnalysis" in args.p_document, false);
    return { data: { id: "fixture" }, error: null };
  } };
  assert.equal((await saveAnalysisDraft(client, result)).id, "fixture");
  assert.equal(calls, 1);
  for (const mutation of [{ verdict: "valid" }, { reviewStatus: "published" }, { evidenceIds: ["invented"] }]) await assert.rejects(saveAnalysisDraft(client, { ...result, draft: { ...result.draft, ...mutation } }), /invalid_analysis_draft/);
  assert.equal(calls, 1);
  await assert.rejects(saveAnalysisDraft({ rpc: async () => ({ error: { message: "PRIVATE_ERROR" } }) }, result), /draft_save_failed/);
  const emptyClient = { rpc: async (_name, args) => { assert.deepEqual(args.p_document.candidates, []); return { data: { id: "empty-fixture" } }; } };
  assert.equal((await saveAnalysisDraft(emptyClient, { ...result, status: "no_evidence", sources: [], draft: { ...result.draft, evidenceIds: [] } })).id, "empty-fixture");
});
