import test from "node:test";
import assert from "node:assert/strict";
import { createFactCheckSearch, normalizeFactCheckResponse } from "../src/lib/evidence/google-fact-check.mjs";

// FICTIONAL contract fixture. example.org is not evidence and is never fetched.
const fixture = () => ({ claims: [{ text: "Klaim fiktif: kebijakan sekolah X berlaku pada 2025.", claimDate: "2025-01-01T00:00:00Z", claimant: "Entitas fiktif", claimReview: [{ publisher: { name: "Penerbit fiktif", site: "example.org" }, url: "https://example.org/fixture#section", title: "Ulasan fiktif khusus pengujian", reviewDate: "2025-01-02T00:00:00Z", textualRating: "Salah (fixture)", languageCode: "id" }] }] });
const query = "Apakah kebijakan sekolah X berlaku pada 2025?";
const json = payload => Response.json(payload);
const configured = options => createFactCheckSearch({ apiKey: "TEST_ONLY_NOT_A_REAL_KEY", enabled: true, ...options });

test("provider is disabled/missing key/invalid input without network calls", async () => {
  const fetchImpl = () => { throw new Error("Network must not run"); };
  assert.equal((await createFactCheckSearch({ fetchImpl })(query)).status, "disabled");
  assert.equal((await createFactCheckSearch({ enabled: true, fetchImpl })(query)).status, "not_configured");
  assert.equal((await configured({ fetchImpl })("pendek")).status, "invalid_input");
});
test("fixed endpoint, header key, bounded options and provenance; no verdict", async () => {
  const search = configured({ now: () => Date.UTC(2026, 9, 24), fetchImpl: async (url, options) => {
    assert.equal(url.origin, "https://factchecktools.googleapis.com");
    assert.equal(url.pathname, "/v1alpha1/claims:search");
    assert.equal(url.searchParams.get("query"), query);
    assert.equal(url.searchParams.get("languageCode"), "id");
    assert.equal(url.searchParams.get("pageSize"), "5");
    assert.equal(url.href.includes("TEST_ONLY"), false);
    assert.equal(options.headers["X-Goog-Api-Key"], "TEST_ONLY_NOT_A_REAL_KEY");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return json(fixture());
  } });
  const result = await search(query);
  assert.equal(result.status, "available");
  assert.equal(result.candidates[0].retrievedAt, "2026-10-24T00:00:00.000Z");
  assert.equal(result.candidates[0].url, "https://example.org/fixture");
  assert.equal(result.candidates[0].contextVerified, false);
  assert.equal("verdict" in result.candidates[0], false);
});
test("normalization deduplicates same review but preserves different claim/date/context", () => {
  const payload = fixture();
  payload.claims.push(structuredClone(payload.claims[0]));
  const opposite = structuredClone(payload.claims[0]); opposite.text = "Klaim fiktif: kebijakan sekolah X TIDAK berlaku pada 2025.";
  const older = structuredClone(payload.claims[0]); older.claimDate = "2024-01-01T00:00:00Z";
  const otherActor = structuredClone(payload.claims[0]); otherActor.claimant = "Entitas fiktif lain";
  payload.claims.push(opposite, older, otherActor);
  const result = normalizeFactCheckResponse(payload, "2026-10-24T00:00:00Z");
  assert.equal(result.length, 4);
  assert.equal(new Set(result.map(row => row.id)).size, 4);
});
test("missing dates remain null; unsafe/malformed metadata is discarded", () => {
  const payload = fixture();
  payload.claims[0].claimDate = "not-a-date";
  payload.claims[0].claimReview[0].reviewDate = undefined;
  const result = normalizeFactCheckResponse(payload, "2026-10-24T00:00:00Z");
  assert.equal(result[0].claimDate, null); assert.equal(result[0].reviewDate, null);
  for (const url of ["javascript:alert(1)", "http://127.0.0.1/x", "http://169.254.169.254/", "https://user:pass@example.org/", "https://x.local/", "http://[::1]/"]) {
    payload.claims[0].claimReview[0].url = url;
    assert.deepEqual(normalizeFactCheckResponse(payload, "2026-10-24T00:00:00Z"), []);
  }
});
test("dedupe concurrent queries and cache defensive copies until expiry", async () => {
  let calls = 0; let now = 0;
  const search = configured({ now: () => now, fetchImpl: async () => { calls++; return json(fixture()); } });
  const results = await Promise.all([search(query), search(`  ${query}  `)]);
  assert.equal(calls, 1);
  results[0].candidates[0].title = "Mutated";
  assert.notEqual((await search(query)).candidates[0].title, "Mutated");
  now = 300_001;
  await search(query); assert.equal(calls, 2);
});
test("different years and negations never share cached query results", async () => {
  let calls = 0;
  const search = configured({ fetchImpl: async () => { calls++; return json({}); } });
  await search(query); await search(query.replace("2025", "2024")); await search(query.replace("berlaku", "tidak berlaku"));
  assert.equal(calls, 3);
});
test("quota, network, malformed JSON/schema/MIME and content cap fail safely", async () => {
  const responses = [new Response("{}", { status: 429 }), new Response("{}", { status: 403 }),
    json({ claims: "bad" }), json(null), new Response("bad", { headers: { "content-type": "application/json" } }),
    new Response("{}", { headers: { "content-type": "text/html" } }),
    new Response("x".repeat(256_001), { headers: { "content-type": "application/json" } })];
  for (const [index, response] of responses.entries()) {
    const result = await configured({ fetchImpl: async () => response })(query);
    assert.equal(result.status, index === 0 ? "rate_limited" : "unavailable"); assert.deepEqual(result.candidates, []);
  }
  assert.equal((await configured({ fetchImpl: async () => { throw new Error("PRIVATE_PROVIDER_ERROR"); } })(query)).status, "unavailable");
  assert.equal((await configured({ fetchImpl: async () => json({}) })(query)).status, "no_candidates");
});
