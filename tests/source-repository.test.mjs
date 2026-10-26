import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFactCheckResponse } from "../src/lib/evidence/google-fact-check.mjs";
import { persistReportCandidates, sourcePayload } from "../src/lib/evidence/source-repository.mjs";

const reportId = "00000000-0000-0000-0000-000000000010";
const candidates = () => normalizeFactCheckResponse({ claims: [{ text: "Klaim fiktif khusus pengujian repository.", claimReview: [{ url: "https://example.org/repository", title: "Fixture artikel", publisher: { name: "Penerbit fiktif" } }] }] }, "2026-10-24T00:00:00Z");

test("repository maps explicit provenance only and preserves missing timestamps", () => {
  const item = candidates()[0];
  const payload = sourcePayload([item, item]);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].claim_date, null); assert.equal(payload[0].review_date, null);
  assert.equal(payload[0].collected_at, "2026-10-24T00:00:00Z");
  for (const key of ["verdict", "review_status", "source_published_at", "contextVerified"]) assert.equal(key in payload[0], false);
});
test("repository rejects tampered IDs, unsafe URLs, verified flags, invalid dates and oversized batches", () => {
  const candidate = candidates()[0];
  for (const changes of [{ id: "f".repeat(64) }, { contextVerified: true }, { url: "http://127.0.0.1/" }, { retrievedAt: "bad" }, { claimDate: "invalid" }, { provider: "unknown" }]) assert.throws(() => sourcePayload([{ ...candidate, ...changes }]), /invalid_candidates/);
  assert.throws(() => sourcePayload(Array(21).fill(candidate)), /invalid_candidates/);
});
test("repository uses one bounded transaction RPC and accepts idempotent replay", async () => {
  let calls = 0;
  const client = { rpc: async (name, args) => {
    calls++; assert.equal(name, "attach_report_candidates"); assert.equal(args.p_report_id, reportId); assert.equal(args.p_candidates.length, 1);
    return { data: calls === 1 ? 1 : 0, error: null };
  } };
  assert.deepEqual(await persistReportCandidates(client, reportId, candidates()), { insertedCount: 1, candidateCount: 1 });
  assert.deepEqual(await persistReportCandidates(client, reportId, candidates()), { insertedCount: 0, candidateCount: 1 });
});
test("repository errors do not disclose database messages or silently succeed", async () => {
  await assert.rejects(persistReportCandidates({}, "invalid", candidates()), /invalid_report/);
  for (const code of ["42501", "23514"]) {
    const client = { rpc: async () => ({ data: null, error: { code, message: "PRIVATE_DB_DETAILS" } }) };
    await assert.rejects(persistReportCandidates(client, reportId, candidates()), error => error.message === (code === "42501" ? "source_write_denied" : "source_write_failed"));
  }
  await assert.rejects(persistReportCandidates({ rpc: async () => ({ data: 99, error: null }) }, reportId, candidates()), /source_write_failed/);
});
