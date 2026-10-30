// Opt-in local end-to-end probe: one submission, then cached replay. Up to two
// Gemini generations and one Fact Check call, no publication. --url adds one
// example.com article fetch and explicit private-IP rejection checks.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";
import { parseCheckResult } from "../src/lib/check-result.mjs";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.CEKFAKTA_BASE_URL || "http://127.0.0.1:3100";
const scope = process.env.CHECK_BUDGET_NAMESPACE;
const urlMode = process.argv.includes("--url");
const webMode = process.argv.includes("--web");
let reportId = null;
let status;
async function probe() {
  const url = new URL(base);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.protocol === "http:");
  assert.match(scope || "", /^itest_[a-z0-9_]{1,50}$/);
  status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  assert.equal(status.API_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
  const payload = webMode ? { inputType: "text", input: "Berdasarkan laporan OECD melalui Programme for International Student Assessment (PISA) 2022, kemampuan siswa Indonesia dalam bidang membaca, matematika, dan sains masih berada di bawah rata-rata negara OECD.", category: "education" }
    : urlMode ? { inputType: "url", input: "https://example.com/", category: "education" }
    : { inputType: "text", input: "Beredar klaim bahwa ijazah Joko Widodo palsu.", category: "politics" };
  if (urlMode) {
    for (const input of ["http://127.0.0.1/article", "http://169.254.169.254/latest/meta-data/"]) {
      const blocked = await fetch(`${base}/api/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, input }) });
      assert.equal(blocked.status, 422); assert.equal((await blocked.json()).error.code, "fetch_blocked");
    }
  }
  const submit = () => fetch(`${base}/api/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(95000) });
  const first = await submit();
  if (first.status !== 200) {
    const error = await first.json();
    if (urlMode && first.status === 422 && error.error?.code === "no_factual_claim") {
      console.log(JSON.stringify({ status: "PASS", mode: "url", privateIpBlocked: true, safeFetchReachedExtraction: true, outcome: "no_factual_claim", draftPersisted: false }));
      return;
    }
    const allowed = ["no_factual_claim", "analysis_unavailable", "service_unavailable", "rate_limited", "budget_exhausted", "processing"];
    console.error(JSON.stringify({ httpStatus: first.status, code: allowed.includes(error.error?.code) ? error.error.code : "request_failed" }));
    throw new Error("live_failed");
  }
  const body = await first.json();
  if (/^[0-9a-f-]{36}$/.test(body.id)) reportId = body.id;
  assert.ok(parseCheckResult(body)); assert.equal(body.cached, false);
  assert.equal(body.verdict, "unverified"); assert.equal(body.reviewStatus, "draft");
  if (webMode) {
    assert.ok(body.sources.some(source => source.kind === "web_source_content"));
    assert.ok(body.sources.some(source => typeof source.excerpt === "string" && source.excerpt.length >= 20));
    assert.equal(body.analysisAvailable, true);
  }
  const replay = await submit(); assert.equal(replay.status, 200);
  const cached = await replay.json(); assert.equal(cached.id, body.id); assert.equal(cached.cached, true);
  assert.equal((await fetch(`${base}/api/reports/${body.id}`)).status, 404);
  const worker = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const report = await worker.from("reports").select("review_status,verdict").eq("id", body.id).single();
  assert.equal(report.error, null); assert.equal(report.data.review_status, "draft"); assert.equal(report.data.verdict, "unverified");
  console.log(JSON.stringify({ status: "PASS", mode: webMode ? "web" : urlMode ? "url" : "text", sourceCount: body.sources.length, excerptCount: body.sources.filter(source => source.excerpt).length, analysisAvailable: body.analysisAvailable, cacheReplay: cached.cached, draftPersisted: true, publicReadStatus: 404 }));
  console.log(`Uji live membuktikan koneksi pipeline dan penyimpanan draft, bukan kebenaran klaim. Maksimal 2 generasi Gemini + 1 pencarian Fact Check${webMode ? " + 1 Tavily basic" : " (Tavily hanya bila fallback diaktifkan dan Fact Check kosong)"}; tanpa Grounding atau publikasi. Mode URL memakai domain contoh, bukan berita nyata.`);
}
try { await probe(); }
catch { console.error("Uji check live belum lulus; key, input dan respons mentah tidak dicetak."); process.exitCode = 1; }
finally {
  if (status && /^itest_[a-z0-9_]{1,50}$/.test(scope || "")) {
    try {
      const statements = [`do $$ declare fixture_id uuid; begin for fixture_id in select report_id from private.check_jobs where scope='${scope}' and report_id is not null loop delete from public.report_audit where report_id=fixture_id; delete from public.reports where id=fixture_id; delete from public.report_audit where detail->>'deleted_report_id'=fixture_id::text; end loop; end $$;`, `delete from private.check_jobs where scope='${scope}';`, `delete from private.check_counters where scope='${scope}';`];
      if (reportId) statements.push(`delete from public.report_audit where report_id='${reportId}'; delete from public.reports where id='${reportId}'; delete from public.report_audit where detail->>'deleted_report_id'='${reportId}';`);
      execFileSync("docker", ["exec", "-i", "supabase_db_02_CEKFAKTA_AGENTIC_WORKSPACE", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statements.join("\n"), stdio: ["pipe", "pipe", "pipe"] });
      console.log("Draft dan namespace probe lokal dibersihkan.");
    } catch { console.error("Pembersihan probe belum lengkap; periksa database lokal."); process.exitCode = 1; }
  }
}
