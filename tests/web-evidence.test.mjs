import test from "node:test";
import assert from "node:assert/strict";
import { createTavilySearch, normalizeWebResults, webSourcePayload } from "../src/lib/evidence/tavily-search.mjs";
import { sourcePayload } from "../src/lib/evidence/source-repository.mjs";
import { createClaimReviewPipeline } from "../src/lib/analysis/claim-pipeline.mjs";
import { createEvidenceComparator } from "../src/lib/analysis/evidence-comparison.mjs";
import { buildAnalysisDocument } from "../src/lib/reports/analysis-draft.mjs";
import { createCheckService, checkHashes } from "../src/lib/check-service.mjs";
import { validateExtractedClaim } from "../src/lib/analysis/claim-extraction.mjs";

const claim = "Pada tahun 2022, angka fiktif siswa A berada di bawah rata-rata kelompok B.";
const quote = "Pada tahun 2022, angka fiktif siswa A tidak berada di bawah rata-rata kelompok B.";
const timestamp = "2026-10-31T00:00:00Z";
const payload = () => ({ results: [{ url: "https://example.org/fictional", title: "Fixture fiktif, bukan fakta", raw_content: quote, published_date: null }] });
const candidate = () => normalizeWebResults(payload(), claim, timestamp)[0];
const options = fetchImpl => ({ enabled: true, apiKey: "FAKE_TAVILY_KEY", now: () => new Date(timestamp), fetchImpl });

test("model query keeps explicit years and original claim provenance; never permits URLs or invented years", () => {
  const value = { outcome: "extracted", claims: [{ quote: claim, subject: null, time: "2022", location: null }], searchQuery: "2022 angka fiktif siswa A kelompok B" };
  assert.equal(validateExtractedClaim(JSON.stringify(value), claim, "education", { includeSearchQuery: true }).claim.text, claim);
  for (const searchQuery of ["angka fiktif tahun 2023", "https://example.org/2022", "angka fiktif tanpa tahun"]) assert.throws(() => validateExtractedClaim(JSON.stringify({ ...value, searchQuery }), claim, "education", { includeSearchQuery: true }));
});

test("missing provider content uses injected safe fetch, never follows private metadata URLs", async () => {
  let fetched = 0;
  const search = createTavilySearch({ ...options(async () => Response.json({ results: [
    { ...payload().results[0], raw_content: null }, { ...payload().results[0], url: "http://127.0.0.1/", raw_content: null }
  ] })), loadArticle: async url => { fetched++; assert.equal(url, "https://example.org/fictional"); return { sourceUrl: url, text: quote, title: "Fetched fixture", publishedAt: null }; } });
  const result = await search(claim, "2022 angka fiktif siswa kelompok B");
  assert.equal(fetched, 1); assert.equal(result.documents.length, 1); assert.equal(result.documents[0].text, quote);
});

test("web provider uses fixed endpoint/basic one-credit options and content, not snippets", async () => {
  let calls = 0;
  const search = createTavilySearch(options(async (url, init) => {
    calls++; assert.equal(url, "https://api.tavily.com/search"); assert.equal(init.redirect, "error");
    assert.equal(init.headers.Authorization, "Bearer FAKE_TAVILY_KEY");
    const body = JSON.parse(init.body); assert.equal(body.query, claim); assert.equal(body.search_depth, "basic");
    assert.equal(body.auto_parameters, false); assert.equal(body.include_answer, false); assert.equal(body.include_raw_content, "text"); assert.equal(body.max_results, 3);
    return Response.json(payload());
  }));
  const result = await search(claim); assert.equal(calls, 1); assert.equal(result.status, "available");
  assert.equal(result.documents[0].text, quote); assert.equal(result.candidates[0].contextVerified, false);
  const noText = normalizeWebResults({ results: [{ ...payload().results[0], raw_content: null, content: "Snippet is not full text." }] }, claim, timestamp);
  assert.equal(noText[0].evidenceKind, "web_search_metadata"); assert.equal(noText[0].documentText, null);
});

test("optional extraction is one fixed-endpoint basic batch; only requested public URLs are accepted", async () => {
  const calls = [];
  const search = createTavilySearch({ ...options(async (url, init) => {
    calls.push(url); const body = JSON.parse(init.body);
    if (url.endsWith("/search")) return Response.json({ results: [{ ...payload().results[0], raw_content: null }] });
    assert.equal(url, "https://api.tavily.com/extract"); assert.equal(init.redirect, "error");
    assert.equal(body.extract_depth, "basic"); assert.deepEqual(body.urls, ["https://example.org/fictional"]);
    return Response.json({ results: [{ url: "https://example.org/fictional", raw_content: quote }, { url: "http://127.0.0.1/", raw_content: "Unrequested data." }] });
  }), extractMissing: true });
  const result = await search(claim); assert.equal(result.documents.length, 1); assert.equal(result.documents[0].text, quote);
  assert.deepEqual(calls, ["https://api.tavily.com/search", "https://api.tavily.com/extract"]);
});

test("web provenance rejects private URLs, tampered content/hash/quote and keeps dates unknown", () => {
  const source = candidate(); const row = webSourcePayload(source);
  assert.equal(row.source_published_at, null); assert.equal(row.review_date, null);
  assert.equal(row.provider, "tavily"); assert.ok(row.content_hash); assert.equal("documentText" in row, false);
  assert.equal(sourcePayload([source, source]).length, 1);
  for (const patch of [{ documentText: "Tampered text must not be accepted." }, { id: "a".repeat(64) }, { contextVerified: true },
    { excerpt: "angka fiktif siswa A tidak", quoteSpan: { start: 22, end: 47 } }, { publishedAt: "invalid" }, { url: "http://127.0.0.1/" }]) assert.throws(() => sourcePayload([{ ...source, ...patch }]));
  assert.equal(normalizeWebResults({ results: [{ ...payload().results[0], url: "http://169.254.169.254/" }] }, claim, timestamp).length, 0);
  assert.equal(sourcePayload([{ ...source, excerpt: quote, quoteSpan: { start: 0, end: quote.length } }])[0].excerpt, quote);
});

test("long pages retain a contiguous relevant passage instead of only navigation; this is not a verdict", () => {
  const raw = "Menu navigation unrelated. ".repeat(1200) + "\n\n" + quote + "\n\n" + "Footer unrelated. ".repeat(1000);
  const result = normalizeWebResults({ results: [{ ...payload().results[0], raw_content: raw }] }, claim, timestamp);
  assert.ok(result[0].documentText.includes(quote)); assert.ok(result[0].documentText.length <= 12000);
  assert.equal(result[0].contextVerified, false); assert.equal(raw.includes(result[0].documentText), true);
});

test("web provider disabled/missing key, quota, bad MIME/schema/size and transport fail without retries", async () => {
  let calls = 0; const noCall = async () => { calls++; throw Error("PRIVATE"); };
  assert.equal((await createTavilySearch(options(noCall))("short")).status, "invalid_input");
  assert.equal((await createTavilySearch({ fetchImpl: noCall })(claim)).status, "disabled");
  assert.equal((await createTavilySearch({ enabled: true, fetchImpl: noCall })(claim)).status, "not_configured"); assert.equal(calls, 0);
  for (const [response, status] of [[new Response("", { status: 432 }), "rate_limited"], [new Response("", { status: 403 }), "access_denied"],
    [new Response("{}", { headers: { "Content-Type": "text/html" } }), "unavailable"], [Response.json({ results: "bad" }), "unavailable"],
    [new Response("x".repeat(512001), { headers: { "Content-Type": "application/json" } }), "unavailable"]]) {
    let requests = 0; assert.equal((await createTavilySearch(options(async () => { requests++; return response; }))(claim)).status, status); assert.equal(requests, 1);
  }
});

test("fallback requires reservation, compares full content and preserves negation/quotes as unverified draft", async () => {
  const source = candidate(); let webCalls = 0; let analysisCalls = 0;
  const compare = createEvidenceComparator({ enabled: true, apiKey: "FAKE", model: "fixture", generate: async request => {
    const input = JSON.parse(request.contents); assert.equal(input.documents[0].sentences[0].text, quote);
    return { text: JSON.stringify({ comparisons: [{ evidenceId: source.id, relation: "contradicts", quoteSentenceId: 0,
      context: { actor: "matches", time: "matches", location: "unknown", event: "unknown" } }] }) };
  } });
  const make = search => createClaimReviewPipeline({ extract: async () => ({ status: "extracted", claim: { text: claim, category: "education" } }),
    search, analyze: async () => { analysisCalls++; throw Error("metadata stage must not run"); }, compare,
    webSearch: async () => { webCalls++; return { status: "available", candidates: [source], documents: [{ evidenceId: source.id, sourceUrl: source.url, text: quote, retrievedAt: timestamp }] }; } });
  const pipeline = make(async () => ({ status: "no_candidates", candidates: [] }));
  assert.equal((await pipeline({})).status, "web_search_unavailable"); assert.equal(webCalls, 0);
  const result = await pipeline({}, { reserveWebSearch: async () => true });
  assert.equal(result.draft.verdict, "unverified"); assert.equal(result.draft.reviewStatus, "draft"); assert.equal(analysisCalls, 0);
  const doc = buildAnalysisDocument(result); assert.equal(doc.candidates[0].excerpt, quote); assert.equal(doc.candidates[0].quote_start, 0);
  assert.match(result.draft.reason, /bertentangan/); assert.equal(webCalls, 1);
  const failed = await make(async () => ({ status: "unavailable", candidates: [] }))({}, { reserveWebSearch: async () => true });
  assert.equal(failed.status, "evidence_unavailable"); assert.equal(webCalls, 1);
});

test("new retrieval policy invalidates old cache without resetting budget or identity", async () => {
  const input = { inputType: "text", input: claim, category: "education" }; const secret = "a".repeat(64);
  const a = checkHashes(input, "client", secret, "model", new Date(timestamp));
  const b = checkHashes(input, "client", secret, "model", new Date(timestamp), "check-v2-tavily");
  assert.notEqual(a.key, b.key); assert.equal(a.subject, b.subject);
  const calls = []; const check = createCheckService({ enabled: true, secret, model: "model", client: { rpc: async (name, args) => {
    calls.push(name); if (name === "reserve_check") return { data: { status: "reserved", token: "lease" } };
    if (name === "reserve_web_search") { assert.equal(args.p_token, "lease"); return { data: true }; } return {};
  } }, review: async (_, context) => { assert.equal(await context.reserveWebSearch(), true); return { status: "web_search_unavailable" }; } });
  await assert.rejects(check(input, "client"), error => error.code === "web_search_unavailable");
  assert.deepEqual(calls, ["reserve_check", "reserve_web_search", "fail_check"]);
});
