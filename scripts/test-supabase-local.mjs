// Explicit integration test: creates disposable users/reports ONLY on loopback Supabase.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import nextEnv from "@next/env";
import { normalizeFactCheckResponse } from "../src/lib/evidence/google-fact-check.mjs";
import { persistReportCandidates, sourcePayload } from "../src/lib/evidence/source-repository.mjs";
import { saveAnalysisDraft } from "../src/lib/reports/analysis-draft.mjs";
import { buildAnalysisDocument } from "../src/lib/reports/analysis-draft.mjs";
import { checkHashes } from "../src/lib/check-service.mjs";
import { parseCheckResult } from "../src/lib/check-result.mjs";

nextEnv.loadEnvConfig(process.cwd());
let status;
try {
  status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
} catch {
  console.error("Status Supabase lokal tidak dapat diperiksa. Nyalakan Docker dan Supabase terlebih dahulu.");
  process.exit(1);
}
const base = process.env.CEKFAKTA_BASE_URL || "http://127.0.0.1:3100";
const loopback = value => { const u = new URL(value); return u.protocol === "http:" && ["127.0.0.1", "localhost"].includes(u.hostname); };
assert.ok(loopback(status.API_URL) && loopback(base), "Tes hanya boleh berjalan pada loopback lokal.");
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, status.API_URL, "Konfigurasi aplikasi harus mengarah ke Supabase lokal yang diuji.");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const operator = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const client = () => createClient(status.API_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
const users = [];
const reportId = randomUUID();
const editorialReportIds = [];
const password = `Test-${randomUUID()}-aA9!`;
const prefix = randomUUID();
const checkScope = process.env.CEKFAKTA_CHECK_TEST_SCOPE;
if (checkScope) {
  assert.match(checkScope, /^itest_[a-z0-9_]{1,50}$/);
  assert.equal(process.env.CHECK_BUDGET_NAMESPACE, checkScope, "Namespace server/tes INT-01 harus sama.");
}
function sql(statement) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_02_CEKFAKTA_AGENTIC_WORKSPACE", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}
function uuid(value) { assert.match(value, /^[0-9a-f-]{36}$/); return value; }
async function api(path, init = {}, cookie = "") {
  return fetch(`${base}${path}`, { ...init, redirect: "manual", headers: { ...init.headers, ...(cookie ? { cookie } : {}) } });
}
const loginRequest = (email, origin = base) => ({ method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify({ email, password }) });
let step = "initialisation";
try {
  step = "create disposable local Auth users";
  for (const label of ["admin", "member"]) {
    const { data, error } = await operator.auth.admin.createUser({ email: `${prefix}-${label}@example.test`, password, email_confirm: true });
    assert.equal(error, null);
    users.push(data.user);
  }
  const [admin, member] = users;
  sql(`insert into public.admin_users(user_id) values ('${uuid(admin.id)}');`);
  const adminDb = client();
  const memberDb = client();
  step = "real GoTrue password authentication";
  assert.equal((await adminDb.auth.signInWithPassword({ email: admin.email, password })).error, null);
  assert.equal((await memberDb.auth.signInWithPassword({ email: member.email, password })).error, null);
  const guest = client();
  step = "PostgREST draft, source and private-note isolation";
  assert.equal((await adminDb.from("reports").insert({ id: reportId, claim: "Klaim fiktif untuk pengujian integrasi lokal saja.", input_type: "text", category: "education", summary: "Fixture integrasi.", reasoning: "Bukan pemeriksaan fakta nyata." })).error, null);
  const candidates = normalizeFactCheckResponse({ claims: [{ text: "Klaim fiktif untuk uji penyimpanan sumber lokal.", claimant: "Entitas fixture", claimDate: "2025-01-01T00:00:00Z", claimReview: [{ url: "https://example.org/local-test", title: "Fixture fiktif", publisher: { name: "Penerbit fixture" }, reviewDate: "2025-01-02T00:00:00Z" }] }] }, new Date().toISOString());
  const inserts = await Promise.all([persistReportCandidates(adminDb, reportId, candidates), persistReportCandidates(adminDb, reportId, candidates)]);
  assert.equal(inserts.reduce((n, item) => n + item.insertedCount, 0), 1);
  assert.equal((await persistReportCandidates(adminDb, reportId, candidates)).insertedCount, 0);
  const stored = await adminDb.from("report_sources").select("*").eq("report_id", reportId).single();
  assert.equal(stored.error, null); assert.equal(stored.data.candidate_key, candidates[0].id);
  assert.equal(stored.data.publisher, "Penerbit fixture"); assert.equal(stored.data.source_published_at, null);
  assert.equal(new Date(stored.data.review_date).toISOString(), "2025-01-02T00:00:00.000Z");
  assert.equal(new Date(stored.data.collected_at).toISOString(), candidates[0].retrievedAt);
  const payload = sourcePayload(candidates);
  const rollback = await adminDb.rpc("attach_report_candidates", { p_report_id: reportId, p_candidates: [{ ...payload[0], candidate_key: "b".repeat(64) }, { ...payload[0], candidate_key: "invalid" }] });
  assert.ok(rollback.error);
  assert.equal((await adminDb.from("report_sources").select("id").eq("report_id", reportId)).data.length, 1);
  await assert.rejects(persistReportCandidates(memberDb, reportId, candidates), /source_write_denied/);
  await assert.rejects(persistReportCandidates(guest, reportId, candidates));
  assert.equal((await adminDb.from("report_private").insert({ report_id: reportId, admin_notes: "Fixture privat lokal." })).error, null);
  for (const db of [guest, memberDb]) {
    const result = await db.from("reports").select("id").eq("id", reportId);
    assert.equal(result.error, null); assert.equal(result.data.length, 0);
    const sources = await db.from("report_sources").select("id").eq("report_id", reportId);
    assert.equal(sources.error, null); assert.equal(sources.data.length, 0);
    assert.ok((await db.from("reports").insert({ claim: "Klaim fiktif terlarang untuk uji integrasi.", input_type: "text", category: "education" })).error);
  }
  assert.ok((await guest.from("report_private").select("*")).error);
  assert.deepEqual((await memberDb.from("report_private").select("*").eq("report_id", reportId)).data, []);
  assert.deepEqual((await memberDb.from("report_audit").select("*").eq("report_id", reportId)).data, []);
  step = "admin publication and retraction via actual JWT/RLS";
  const published = await adminDb.from("reports").update({ review_status: "published", published_by: member.id }).eq("id", reportId).select("published_by").single();
  assert.equal(published.error, null); assert.equal(published.data.published_by, admin.id);
  await assert.rejects(persistReportCandidates(adminDb, reportId, candidates), /source_write_denied/);
  assert.equal((await guest.from("reports").select("id").eq("id", reportId)).data.length, 1);
  assert.equal((await guest.from("report_sources").select("id").eq("report_id", reportId)).data.length, 1);
  assert.equal((await adminDb.from("reports").update({ review_status: "draft" }).eq("id", reportId)).error, null);
  assert.equal((await guest.from("reports").select("id").eq("id", reportId)).data.length, 0);
  assert.ok((await adminDb.from("report_audit").select("id").eq("report_id", reportId)).data.length >= 5);
  step = "application HTTP auth and CSRF boundaries";
  assert.equal((await api("/api/admin/session")).status, 401);
  step = "cross-origin login rejection";
  assert.equal((await api("/api/admin/login", loginRequest(admin.email, "https://evil.example"))).status, 403);
  step = "login JSON MIME, byte cap and malformed UTF-8";
  assert.equal((await api("/api/admin/login", { method: "POST", headers: { origin: base, "Content-Type": "application/jsonp" }, body: "{}" })).status, 415);
  assert.equal((await api("/api/admin/login", { method: "POST", headers: { origin: base, "Content-Type": "application/json" }, body: "x".repeat(4097) })).status, 413);
  assert.equal((await api("/api/admin/login", { method: "POST", headers: { origin: base, "Content-Type": "application/json" }, body: new Uint8Array([255]) })).status, 400);
  step = "incorrect password rejection";
  assert.equal((await api("/api/admin/login", { ...loginRequest(admin.email), body: JSON.stringify({ email: admin.email, password: "wrong-password" }) })).status, 401);
  step = "non-admin login rejection";
  assert.equal((await api("/api/admin/login", loginRequest(member.email))).status, 403);
  const cookieStore = new Map();
  const memberSsr = createServerClient(status.API_URL, status.ANON_KEY, { cookies: { getAll: () => [...cookieStore].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => cookieStore.set(name, value)) } });
  assert.equal((await memberSsr.auth.signInWithPassword({ email: member.email, password })).error, null);
  const memberCookie = [...cookieStore].map(([name, value]) => `${name}=${value}`).join("; ");
  step = "non-admin session rejection";
  assert.equal((await api("/api/admin/session", {}, memberCookie)).status, 403);
  step = "allowlisted admin login";
  const login = await api("/api/admin/login", loginRequest(admin.email));
  assert.equal(login.status, 200);
  const setCookies = login.headers.getSetCookie();
  assert.ok(setCookies.some(value => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value)));
  const adminCookie = setCookies.map(value => value.split(";")[0]).join("; ");
  assert.equal((await api("/api/admin/session", {}, adminCookie)).status, 200);
  const dashboard = await api("/admin", {}, adminCookie);
  assert.equal(dashboard.status, 200); assert.match(await dashboard.text(), /Dashboard Admin/);
  step = "BE-03 guest/non-admin and CSRF boundaries";
  const mutation = (body, method = "POST", origin = base) => ({ method, headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) });
  const document = { claim: `${prefix} Klaim fiktif khusus pengujian HTTP editorial lokal 100%_literal.`, category: "education", verdict: "unverified", summary: "Ringkasan fixture editorial.", reasoning: "Bukan pemeriksaan fakta nyata.", adminNotes: "Catatan privat editorial.", sources: [{ url: "https://example.org/editorial-fixture", title: "Sumber fixture", excerpt: "Kutipan fiktif.", publishedAt: null }] };
  assert.equal((await api("/api/admin/reports")).status, 401);
  assert.equal((await api("/api/admin/reports", mutation(document))).status, 401);
  assert.equal((await api("/api/admin/reports", {}, memberCookie)).status, 403);
  assert.equal((await api("/api/admin/reports", mutation(document), memberCookie)).status, 403);
  assert.equal((await api("/api/admin/reports/analyze", mutation({}), memberCookie)).status, 403);
  assert.equal((await api("/api/admin/reports/analyze", mutation({}))).status, 401);
  assert.equal((await api("/api/admin/reports/analyze", mutation({}, "POST", "https://evil.example"), adminCookie)).status, 403);
  assert.equal((await api("/api/admin/reports/analyze", mutation({}), adminCookie)).status, 400);
  assert.equal((await api("/api/admin/reports", mutation(document, "POST", "https://evil.example"), adminCookie)).status, 403);
  assert.equal((await api("/api/admin/reports", mutation({ ...document, review_status: "published" }), adminCookie)).status, 400);
  assert.equal((await api("/api/admin/reports", { method: "POST", headers: { origin: base, "Content-Type": "text/plain" }, body: "{}" }, adminCookie)).status, 415);
  assert.equal((await api("/api/admin/reports", { method: "POST", headers: { origin: base, "Content-Type": "application/json" }, body: "x".repeat(100001) }, adminCookie)).status, 413);
  step = "BE-03 HTTP atomic draft creation/detail and private-note isolation";
  const createdResponse = await api("/api/admin/reports", mutation(document), adminCookie);
  assert.equal(createdResponse.status, 201);
  let editorial = (await createdResponse.json()).report;
  editorialReportIds.push(uuid(editorial.id));
  assert.equal(editorial.review_status, "draft"); assert.equal(editorial.verdict, "unverified");
  const reportPath = `/api/admin/reports/${editorial.id}`;
  assert.equal((await api(reportPath)).status, 401);
  assert.equal((await api(reportPath, {}, memberCookie)).status, 403);
  const detailResponse = await api(reportPath, {}, adminCookie);
  assert.match(detailResponse.headers.get("cache-control"), /no-store/);
  const detail = await detailResponse.json();
  assert.equal(detail.report.report_private.admin_notes, document.adminNotes);
  assert.equal(detail.report.report_sources.length, 1);
  assert.ok(detail.audit.length >= 3);
  assert.equal((await guest.from("reports").select("id").eq("id", editorial.id)).data.length, 0);
  step = "FE-02 draft hidden even with admin cookies on public routes";
  assert.equal((await api(`/api/reports/${editorial.id}`)).status, 404);
  assert.equal((await api(`/api/reports/${editorial.id}`, {}, adminCookie)).status, 404);
  assert.equal((await api(`/reports/${editorial.id}`, {}, adminCookie)).status, 404);
  assert.equal((await api(`/admin/${editorial.id}`, {}, adminCookie)).status, 200);
  assert.equal((await api("/admin/new", {}, adminCookie)).status, 200);
  assert.equal((await api("/api/admin/reports?status=other", {}, adminCookie)).status, 400);
  assert.equal((await api("/api/admin/reports?status=draft&page=1", {}, adminCookie)).status, 200);
  step = "BE-03 concurrent edit conflict";
  const edit = { ...document, summary: "Perubahan fixture HTTP.", expectedUpdatedAt: editorial.updated_at };
  const concurrent = await Promise.all([api(reportPath, mutation(edit, "PATCH"), adminCookie), api(reportPath, mutation(edit, "PATCH"), adminCookie)]);
  assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
  editorial = (await concurrent.find(response => response.status === 200).json()).report;
  assert.equal((await api(reportPath, mutation({ action: "publish", expectedUpdatedAt: editorial.updated_at }, "PATCH"), adminCookie)).status, 400);
  step = "BE-03 approval/publication, retraction and archive/restore";
  const transition = async (action, method = "PATCH") => {
    const response = await api(reportPath, mutation({ action, expectedUpdatedAt: editorial.updated_at, ...(action === "publish" ? { reviewed: true } : {}) }, method), adminCookie);
    assert.equal(response.status, 200); editorial = (await response.json()).report;
  };
  await transition("publish");
  assert.equal(editorial.published_by, admin.id);
  assert.equal((await guest.from("reports").select("id").eq("id", editorial.id)).data.length, 1);
  step = "FE-02 published API, SSR detail, source and private-data exclusion";
  const publicResponse = await api(`/api/reports/${editorial.id}`);
  assert.equal(publicResponse.status, 200); assert.match(publicResponse.headers.get("cache-control"), /no-store/);
  const publicReport = (await publicResponse.json()).report;
  assert.equal(publicReport.id, editorial.id); assert.equal(publicReport.verdict, "unverified");
  assert.equal(publicReport.sources[0].url, document.sources[0].url);
  assert.equal(publicReport.sources[0].publishedAt, null);
  assert.equal("published_by" in publicReport, false);
  assert.doesNotMatch(JSON.stringify(publicReport), /report_private|admin_notes|report_audit|actor_id|Catatan privat editorial/);
  const publicPage = await api(`/reports/${editorial.id}`);
  assert.equal(publicPage.status, 200);
  const publicHtml = await publicPage.text();
  assert.ok(publicHtml.includes(document.claim)); assert.ok(publicHtml.includes(document.sources[0].title));
  assert.match(publicHtml, /Belum dapat diverifikasi/);
  assert.doesNotMatch(publicHtml, /Catatan privat editorial|report_private|admin_notes|report_audit/);
  const search = await api(`/api/reports?q=${encodeURIComponent(prefix)}&category=education&verdict=unverified`);
  assert.equal(search.status, 200); assert.equal((await search.json()).total, 1);
  assert.equal((await (await api(`/api/reports?q=${encodeURIComponent(`${prefix} does not exist`)}`)).json()).total, 0);
  assert.equal((await (await api(`/api/reports?q=${encodeURIComponent("100%_literal")}`)).json()).reports.some(row => row.id === editorial.id), true);
  assert.equal((await api("/api/reports?status=draft")).status, 400);
  assert.equal((await api("/api/reports?page=0")).status, 400);
  assert.equal((await api("/api/reports?verdict=other")).status, 400);
  assert.equal((await api("/api/reports/missing")).status, 404);
  assert.equal((await api(`/api/reports/${randomUUID()}`)).status, 404);
  assert.equal((await api(reportPath, mutation({ ...document, expectedUpdatedAt: editorial.updated_at }, "PATCH"), adminCookie)).status, 409);
  await transition("retract");
  assert.equal((await guest.from("reports").select("id").eq("id", editorial.id)).data.length, 0);
  step = "FE-02 retraction immediately disappears from fresh public requests";
  assert.equal((await api(`/api/reports/${editorial.id}`)).status, 404);
  assert.equal((await api(`/reports/${editorial.id}`)).status, 404);
  assert.equal((await (await api(`/api/reports?q=${encodeURIComponent(prefix)}`)).json()).total, 0);
  await transition("reject", "DELETE"); assert.equal(editorial.review_status, "rejected");
  assert.equal((await api(`/api/reports/${editorial.id}`)).status, 404);
  await transition("restore"); assert.equal(editorial.review_status, "draft");
  step = "BE-03 policy-guarded analysis persistence using fictional injected result";
  const aiReport = await saveAnalysisDraft(adminDb, { status: "draft_ready", sources: candidates, draft: {
    claim: document.claim, category: "education", verdict: "unverified", reviewStatus: "draft", summary: "Fixture draft analisis.", reason: "Bukti belum cukup.", limitations: ["Fixture integrasi, bukan hasil model live."], evidenceIds: [candidates[0].id],
  }, proposedAnalysis: { verdict: "valid" } });
  editorialReportIds.push(uuid(aiReport.id));
  const savedAi = (await (await api(`/api/admin/reports/${aiReport.id}`, {}, adminCookie)).json()).report;
  assert.equal(savedAi.verdict, "unverified"); assert.equal(savedAi.review_status, "draft");
  assert.equal(savedAi.report_sources[0].candidate_key, candidates[0].id);
  const aiEdit = await api(`/api/admin/reports/${aiReport.id}`, mutation({ ...document, expectedUpdatedAt: savedAi.updated_at }, "PATCH"), adminCookie);
  assert.equal(aiEdit.status, 200);
  const retained = (await (await api(`/api/admin/reports/${aiReport.id}`, {}, adminCookie)).json()).report;
  assert.equal(retained.report_sources.filter(source => source.candidate_key).length, 1);
  assert.equal(retained.report_sources.filter(source => !source.candidate_key).length, 1);
  step = "FE-02 deterministic public pagination and filters with disposable published fixtures";
  const paginationQuery = `PaginationFixture-${prefix}`;
  const paginationRows = Array.from({ length: 13 }, (_, index) => ({ id: randomUUID(), claim: `${paginationQuery} Klaim fiktif halaman ${index + 1}.`, input_type: "text", category: index < 2 ? "politics" : "education", summary: "Fixture pagination, bukan fakta.", reasoning: "Pengujian lokal sementara." }));
  editorialReportIds.push(...paginationRows.map(row => uuid(row.id)));
  assert.equal((await adminDb.from("reports").insert(paginationRows)).error, null);
  assert.equal((await adminDb.from("report_sources").insert(paginationRows.map(row => ({ report_id: row.id, source_url: "https://example.org/pagination-fixture", source_title: "Sumber fiktif pagination" })))).error, null);
  assert.equal((await adminDb.from("reports").update({ review_status: "published" }).in("id", paginationRows.map(row => row.id))).error, null);
  const firstPage = await (await api(`/api/reports?q=${encodeURIComponent(paginationQuery)}`)).json();
  const secondPage = await (await api(`/api/reports?q=${encodeURIComponent(paginationQuery)}&page=2`)).json();
  assert.equal(firstPage.total, 13); assert.equal(firstPage.reports.length, 12); assert.equal(secondPage.reports.length, 1);
  assert.equal(new Set([...firstPage.reports, ...secondPage.reports].map(row => row.id)).size, 13);
  const beyondPage = await api(`/api/reports?q=${encodeURIComponent(paginationQuery)}&page=3`);
  assert.equal(beyondPage.status, 200);
  const beyond = await beyondPage.json(); assert.equal(beyond.total, 13); assert.deepEqual(beyond.reports, []);
  const political = await (await api(`/api/reports?q=${encodeURIComponent(paginationQuery)}&category=politics`)).json();
  assert.equal(political.total, 2);
  assert.equal((await (await api(`/api/reports?q=${encodeURIComponent(paginationQuery)}&verdict=valid`)).json()).total, 0);
  const noMatchesPage = await api(`/api/reports?q=${encodeURIComponent(paginationQuery)}&verdict=valid&page=2`);
  assert.equal(noMatchesPage.status, 200); assert.equal((await noMatchesPage.json()).total, 0);
  const listHtml = await (await api(`/reports?q=${encodeURIComponent(paginationQuery)}`)).text();
  assert.match(listHtml, /Berikutnya/); assert.ok(listHtml.includes(paginationQuery));
  assert.ok((await (await api("/")).text()).includes(paginationQuery));
  if (checkScope) {
    step = "INT-01 service-only RPC, concurrent lease and cached HTTP result without providers";
    assert.ok(process.env.CHECK_HASH_SECRET && process.env.GEMINI_MODEL);
    const submitted = { inputType: "text", input: `${prefix} Klaim fiktif untuk uji kontrak pemeriksaan publik.`, category: "education" };
    const hashes = checkHashes(submitted, "fixture-subject", process.env.CHECK_HASH_SECRET, process.env.GEMINI_MODEL, new Date(), process.env.WEB_SEARCH_ENABLED === "true" ? "check-v2-tavily" : "check-v1");
    const args = { p_scope: checkScope, p_key: hashes.key, p_subject: hashes.subject, p_url: false };
    assert.ok((await guest.rpc("reserve_check", args)).error);
    assert.ok((await memberDb.rpc("reserve_check", args)).error);
    const reservations = await Promise.all([operator.rpc("reserve_check", args), operator.rpc("reserve_check", args)]);
    assert.ok(reservations.every(value => !value.error));
    assert.deepEqual(reservations.map(value => value.data.status).sort(), ["processing", "reserved"]);
    const token = reservations.find(value => value.data.status === "reserved").data.token;
    const guarded = { status: "draft_ready", analysisAvailable: true, sources: candidates, draft: {
      claim: submitted.input, category: "education", verdict: "unverified", reviewStatus: "draft", summary: "Fixture hasil awal.", reason: "Bukti fiktif tidak memverifikasi klaim nyata.", limitations: ["Fixture terinjeksi khusus acceptance."], evidenceIds: [candidates[0].id],
    } };
    const completed = await operator.rpc("complete_check", { p_scope: checkScope, p_key: hashes.key, p_token: token,
      p_document: { ...buildAnalysisDocument(guarded), limitations: guarded.draft.limitations }, p_input_type: "text", p_url: null, p_analysis: true });
    assert.equal(completed.error, null); editorialReportIds.push(uuid(completed.data.id));
    const cachedResponse = await api("/api/check", mutation(submitted));
    assert.equal(cachedResponse.status, 200);
    assert.match(cachedResponse.headers.get("cache-control"), /no-store/);
    const checked = await cachedResponse.json(); assert.ok(parseCheckResult(checked));
    assert.equal(checked.cached, true); assert.equal(checked.id, completed.data.id); assert.equal(checked.verdict, "unverified");
    assert.equal((await api(`/api/reports/${checked.id}`)).status, 404);
    assert.doesNotMatch(JSON.stringify(checked), /token|candidate_key|adminNotes|report_private/);
    for (let index = 0; index < 3; index++) assert.equal((await api("/api/check", mutation(submitted))).status, 200);
    // A sixth request from the same unknown-client bucket must stop before any model call.
    assert.equal((await api("/api/check", mutation(submitted))).status, 200);
    const limited = await api("/api/check", mutation(submitted));
    assert.equal(limited.status, 429); assert.ok(limited.headers.get("retry-after"));
    assert.equal((await api("/api/check", mutation({ ...submitted, reviewStatus: "published" }))).status, 400);
    assert.equal((await api("/api/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(22001) })).status, 413);
    if (process.env.PUBLIC_URL_CHECK_ENABLED !== "true") {
      const gated = await api("/api/check", mutation({ inputType: "url", input: "https://example.org/article", category: "education" }));
      assert.equal(gated.status, 422); assert.equal((await gated.json()).error.code, "url_disabled");
    }
    const count = await adminDb.from("reports").select("id").eq("claim", submitted.input);
    assert.equal(count.data.length, 1);
  }
  step = "membership revocation and logout";
  sql(`delete from public.admin_users where user_id='${uuid(admin.id)}';`);
  assert.equal((await api("/api/admin/session", {}, adminCookie)).status, 403);
  assert.equal((await api("/api/admin/reports", {}, adminCookie)).status, 403);
  const logout = await api("/api/admin/logout", { method: "POST", headers: { origin: base } }, adminCookie);
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.getSetCookie().some(value => /Max-Age=0/i.test(value)));
  console.log(`Integrasi lokal lulus: BE-03/FE-02 Auth/RLS/HTTP, pagination, privasi, approval dan retraction.${checkScope ? " INT-01 RPC service-only, concurrent lease, cache HTTP/result contract, satu draft/replay, 429/Retry-After dan batas body juga lulus." : " INT-01 khusus tidak dijalankan tanpa namespace fixture."} Tanpa provider live.`);
} catch (error) {
  // Avoid logging SDK responses, tokens, keys, credentials, or request payloads.
  console.error(`Integrasi lokal gagal pada tahap: ${step}. Detail sensitif tidak dicetak.`);
  if (error?.code === "ERR_ASSERTION" && typeof error.actual === "number" && typeof error.expected === "number") console.error(`Status/count aktual: ${error.actual}; diharapkan: ${error.expected}.`);
  process.exitCode = 1;
} finally {
  try {
    if (checkScope) sql(`delete from private.check_jobs where scope='${checkScope}'; delete from private.check_counters where scope='${checkScope}';`);
    for (const fixtureId of [reportId, ...editorialReportIds]) sql(`delete from public.report_audit where report_id='${uuid(fixtureId)}';
      delete from public.reports where id='${fixtureId}';
      delete from public.report_audit where detail->>'deleted_report_id'='${fixtureId}';`);
    for (const user of users) {
      const { error } = await operator.auth.admin.deleteUser(user.id);
      if (error) throw error;
    }
    console.log("Fixture laporan dan akun lokal dibersihkan.");
  } catch { console.error("Pembersihan fixture lokal belum lengkap; periksa database dev."); process.exitCode = 1; }
}
