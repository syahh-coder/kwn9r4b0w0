// Opt-in LIVE local acceptance: <=2 Gemini calls + 1 Fact Check + 1 Tavily basic
// search, followed by cached API/browser replay. No publication; cleans its draft.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";
import { parseCheckResult } from "../src/lib/check-result.mjs";

nextEnv.loadEnvConfig(process.cwd());
assert.ok(process.env.TAVILY_API_KEY, "TAVILY_API_KEY belum diisi.");
const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
assert.match(status.API_URL, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
assert.equal(status.API_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
const scope = `itest_web_${randomUUID().replaceAll("-", "")}`;
const listener = createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  windowsHide: true, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, WEB_SEARCH_ENABLED: "true", CHECK_BUDGET_NAMESPACE: scope, CHECK_TRUSTED_IP_HEADER: "" } });
server.stderr.setEncoding("utf8");
server.stderr.on("data", chunk => {
  // Only bounded application-generated labels, never arbitrary server/provider stderr.
  for (const match of chunk.matchAll(/cekfakta_check:(extraction|retrieval|comparison|analysis|pipeline):([a-z_]{1,40})\b/g)) console.log(match[0]);
});
let browser; let stage = "startup";
function sql(statement) { return execFileSync("docker", ["exec", "-i", "supabase_db_02_CEKFAKTA_AGENTIC_WORKSPACE", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }); }
try {
  for (let i = 0; i < 80; i++) {
    assert.equal(server.exitCode, null, "Server acceptance berhenti.");
    try { if ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) break; } catch { /* Startup. */ }
    if (i === 79) throw Error("Server belum siap."); await new Promise(resolve => setTimeout(resolve, 250));
  }
  const payload = { inputType: "text", category: "education", input: "Berdasarkan laporan OECD melalui Programme for International Student Assessment (PISA) 2022, kemampuan siswa Indonesia dalam bidang membaca, matematika, dan sains masih berada di bawah rata-rata negara OECD." };
  const submit = () => fetch(`${base}/api/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(95000) });
  stage = "pipeline live PISA";
  const response = await submit(); const raw = await response.json();
  if (!response.ok) { const code = ["web_search_unavailable", "analysis_unavailable", "service_unavailable", "no_factual_claim"].includes(raw.error?.code) ? raw.error.code : "request_failed"; throw Error(`HTTP ${response.status}: ${code}`); }
  const body = parseCheckResult(raw); assert.ok(body); assert.equal(body.cached, false);
  console.log(JSON.stringify({ phase: "retrieval", sourceKinds: body.sources.map(source => source.kind), domains: body.sources.map(source => new URL(source.url).hostname), excerpts: body.sources.filter(source => source.excerpt).length }));
  assert.equal(body.verdict, "unverified"); assert.equal(body.reviewStatus, "draft"); assert.equal(body.analysisAvailable, true);
  assert.ok(body.sources.some(source => source.kind === "web_source_content"));
  assert.ok(body.sources.some(source => source.excerpt?.length >= 20));
  const db = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = await db.from("report_sources").select("provider,content_hash,quote_start,quote_end,excerpt").eq("report_id", body.id);
  assert.equal(rows.error, null); assert.ok(rows.data.some(row => row.provider === "tavily" && row.content_hash && row.quote_end > row.quote_start && body.sources.some(source => source.excerpt === row.excerpt)));
  assert.equal((await fetch(`${base}/reports/${body.id}`)).status, 404);
  const replay = await submit(); assert.equal(replay.status, 200); const cached = await replay.json(); assert.equal(cached.cached, true); assert.equal(cached.id, body.id);
  stage = "browser cached full-text result";
  browser = await chromium.launch(); const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  const errors = []; page.on("pageerror", () => errors.push("runtime_error"));
  await page.goto(`${base}/check`, { waitUntil: "load" });
  await page.getByLabel("Klaim yang ingin diperiksa").fill(payload.input);
  const received = page.waitForResponse(r => r.url() === `${base}/api/check`);
  await page.getByRole("button", { name: "Periksa Sekarang" }).click();
  assert.equal((await (await received).json()).cached, true);
  const result = page.getByRole("status", { name: "Hasil awal pemeriksaan" }); await result.waitFor();
  assert.ok(await result.locator("blockquote").count()); assert.match(await result.innerText(), /Belum dapat diverifikasi/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); assert.deepEqual(axe.violations.map(item => item.id), []);
  assert.deepEqual(errors, []); await mkdir("artifacts/qa", { recursive: true });
  await page.screenshot({ path: "artifacts/qa/web-live-mobile.png", fullPage: true });
  console.log(JSON.stringify({ status: "PASS", sources: body.sources.length, excerpts: body.sources.filter(source => source.excerpt).length,
    domains: body.sources.map(source => new URL(source.url).hostname), draftPersisted: true, publicRead: 404, cachedApiAndBrowser: true, browserAxe: "PASS" }));
  console.log("Hasil membuktikan retrieval/comparison/persistensi, bukan verdict kebenaran. Tidak ada publish atau aktivasi paid/billing.");
} catch (error) {
  console.error(`FAIL: ${stage}. ${error instanceof Error ? error.message.slice(0, 500) : "Tidak ada detail sensitif."}`); process.exitCode = 1;
} finally {
  await browser?.close();
  try {
    sql(`do $$ declare fixture_id uuid; begin for fixture_id in select report_id from private.check_jobs where scope='${scope}' and report_id is not null loop delete from public.report_audit where report_id=fixture_id; delete from public.reports where id=fixture_id; delete from public.report_audit where detail->>'deleted_report_id'=fixture_id::text; end loop; end $$;
      delete from private.check_jobs where scope='${scope}'; delete from private.check_counters where scope='${scope}';`);
    console.log("CLEANUP: draft/namespace probe dihapus; data dan akun pengguna dipertahankan.");
  } catch { console.error("CLEANUP gagal: periksa namespace itest_web lokal."); process.exitCode = 1; }
  if (server.exitCode === null) { server.kill(); await once(server, "exit"); }
}
