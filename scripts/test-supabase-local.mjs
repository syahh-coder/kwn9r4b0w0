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
  const document = { claim: "Klaim fiktif khusus pengujian HTTP editorial lokal.", category: "education", verdict: "unverified", summary: "Ringkasan fixture editorial.", reasoning: "Bukan pemeriksaan fakta nyata.", adminNotes: "Catatan privat editorial.", sources: [{ url: "https://example.org/editorial-fixture", title: "Sumber fixture", excerpt: "Kutipan fiktif.", publishedAt: null }] };
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
  assert.equal((await api(reportPath, mutation({ ...document, expectedUpdatedAt: editorial.updated_at }, "PATCH"), adminCookie)).status, 409);
  await transition("retract");
  assert.equal((await guest.from("reports").select("id").eq("id", editorial.id)).data.length, 0);
  await transition("reject", "DELETE"); assert.equal(editorial.review_status, "rejected");
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
  step = "membership revocation and logout";
  sql(`delete from public.admin_users where user_id='${uuid(admin.id)}';`);
  assert.equal((await api("/api/admin/session", {}, adminCookie)).status, 403);
  assert.equal((await api("/api/admin/reports", {}, adminCookie)).status, 403);
  const logout = await api("/api/admin/logout", { method: "POST", headers: { origin: base } }, adminCookie);
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.getSetCookie().some(value => /Max-Age=0/i.test(value)));
  console.log("Integrasi lokal lulus: BE-03 CRUD/approval/retract/arsip/restore HTTP, concurrent edit 200/409, draft analisis atomik, provenance, Auth/RLS/CSRF, catatan privat, pencabutan izin dan logout. Tanpa provider live.");
} catch (error) {
  // Avoid logging SDK responses, tokens, keys, credentials, or request payloads.
  console.error(`Integrasi lokal gagal pada tahap: ${step}. Detail sensitif tidak dicetak.`);
  if (error?.code === "ERR_ASSERTION" && typeof error.actual === "number" && typeof error.expected === "number") console.error(`Status/count aktual: ${error.actual}; diharapkan: ${error.expected}.`);
  process.exitCode = 1;
} finally {
  try {
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
