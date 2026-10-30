import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { parseReportFilters, reportsHref, listPublicReports, getPublicReport } from "../src/lib/reports/public-repository.mjs";

const id = "00000000-0000-0000-0000-000000000010";
const row = () => ({ id, claim: "Klaim fiktif untuk pengujian laporan publik.", category: "education", verdict: "unverified", review_status: "published", summary: "Ringkasan fiktif.", published_at: "2026-10-30T01:00:00Z", updated_at: "2026-10-30T01:00:00Z", reasoning: "Alasan fiktif.", admin_notes: "PRIVATE_NOTES", published_by: "PRIVATE_ID", report_private: { admin_notes: "PRIVATE_NESTED" } });
function client(payload, inspect = () => {}, status = 200) {
  return createClient("https://example.test", "TEST_ONLY_NOT_A_KEY", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    inspect(new URL(input), init);
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", "Content-Range": `0-0/${Array.isArray(payload) ? payload.length : 1}` } });
  } } });
}
const filters = () => ({ q: "", category: "", verdict: "", page: 1 });
test("public filters reject status/projection injection, duplicates, wild pages and invalid categories", () => {
  assert.deepEqual(parseReportFilters(new URLSearchParams()), filters());
  assert.deepEqual(parseReportFilters(new URLSearchParams("q=sekolah&category=education&verdict=unverified&page=2")), { q: "sekolah", category: "education", verdict: "unverified", page: 2 });
  for (const query of ["status=draft", "select=*", "page=0", "page=-1", "page=1.5", "page=1001", "page=01", "q=a&q=b", "q=*", "category=other", "verdict=published", "q=%00", `q=${"x".repeat(151)}`]) assert.equal(parseReportFilters(new URLSearchParams(query)), null);
});
test("pagination links encode query text and retain filters", () => {
  const value = { ...filters(), q: "<teks> & tahun=2025", category: "politics", verdict: "unverified" };
  const url = new URL(reportsHref(value, 2), "https://example.test");
  assert.equal(url.pathname, "/reports"); assert.equal(url.searchParams.get("q"), value.q); assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("category"), "politics"); assert.equal(url.searchParams.get("verdict"), "unverified");
});
test("real SDK query enforces published, literal wildcard search, explicit projection and bounded pagination", async () => {
  const query = { ...filters(), q: "100%_\\sekolah,(draft)", category: "education", verdict: "unverified", page: 2 };
  const result = await listPublicReports(client([row()], url => {
    assert.equal(url.searchParams.get("review_status"), "eq.published");
    assert.equal(url.searchParams.get("category"), "eq.education");
    assert.equal(url.searchParams.get("verdict"), "eq.unverified");
    assert.equal(url.searchParams.get("claim"), "ilike.%100\\%\\_\\\\sekolah,(draft)%");
    assert.equal(url.searchParams.get("offset"), "12"); assert.equal(url.searchParams.get("limit"), "12");
    assert.doesNotMatch(url.searchParams.get("select"), /\*|report_private|admin_notes|published_by/);
  }), query);
  assert.equal(result.reports[0].reviewStatus, "published"); assert.equal(result.page, 2);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|published_by|admin_notes|report_private|reasoning/);
});
test("detail only exposes source allowlist and blocks unsafe source links", async () => {
  const source = { id, source_url: "javascript:alert(1)", source_title: "Fixture", publisher: "Penerbit fixture", collected_at: "2026-10-30T00:00:00Z", candidate_key: "PRIVATE_KEY", original_rating: "PRIVATE_RATING", report_id: "PRIVATE_PARENT" };
  const result = await getPublicReport(client([ { ...row(), report_sources: [source] } ], url => {
    assert.equal(url.searchParams.get("id"), `eq.${id}`); assert.equal(url.searchParams.get("review_status"), "eq.published");
    assert.equal(url.searchParams.get("report_sources.limit"), "100");
    assert.doesNotMatch(url.searchParams.get("select"), /\*|report_private|admin_notes|published_by|original_rating|candidate_key/);
  }), id);
  assert.equal(result.sources[0].url, null);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|javascript:/);
});
test("missing and invalid IDs do not expose draft existence; unexpected draft payload fails closed", async () => {
  assert.equal(await getPublicReport(client(null, () => { throw new Error("must not fetch"); }), "invalid"), null);
  assert.equal(await getPublicReport(client([]), id), null);
  await assert.rejects(getPublicReport(client([{ ...row(), review_status: "draft" }]), id), /unavailable/);
  await assert.rejects(listPublicReports(client([{ ...row(), review_status: "rejected" }]), filters()), /unavailable/);
});
test("provider errors are unavailable rather than fabricated empty results; valid empty stays empty", async () => {
  await assert.rejects(listPublicReports(client({ message: "PRIVATE_DB_ERROR" }, () => {}, 500), filters()), error => error.message === "unavailable");
  await assert.rejects(getPublicReport(client({ message: "PRIVATE_DB_ERROR" }, () => {}, 500), id), error => error.message === "unavailable");
  const result = await listPublicReports(client([]), filters());
  assert.deepEqual(result.reports, []); assert.equal(result.total, 0);
});
test("out-of-range 416 recovers filtered count without hiding unrelated service errors", async () => {
  let calls = 0;
  const db = createClient("https://example.test", "TEST_ONLY_NOT_A_KEY", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    calls++;
    const url = new URL(input);
    assert.equal(url.searchParams.get("review_status"), "eq.published");
    assert.equal(url.searchParams.get("category"), "eq.education");
    if (init.method === "HEAD") {
      assert.equal(url.searchParams.has("offset"), false);
      return new Response(null, { headers: { "Content-Range": "*/13" } });
    }
    return Response.json({ code: "PGRST103", message: "Range exceeded" }, { status: 416 });
  } } });
  const result = await listPublicReports(db, { ...filters(), category: "education", page: 3 });
  assert.equal(calls, 2); assert.equal(result.total, 13); assert.deepEqual(result.reports, []);
  await assert.rejects(listPublicReports(client({ code: "OTHER_ERROR" }, () => {}, 416), filters()), /unavailable/);
});
