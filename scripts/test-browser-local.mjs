// Acceptance browser nyata, khusus loopback + Supabase lokal. Semua fixture
// diberi label fiktif dan dibersihkan; tidak memanggil Gemini/Fact Check.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { once } from "node:events";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";
import { checkHashes } from "../src/lib/check-service.mjs";
import { buildAnalysisDocument } from "../src/lib/reports/analysis-draft.mjs";

nextEnv.loadEnvConfig(process.cwd());
const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(status.API_URL), "Hanya Supabase loopback.");
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, status.API_URL);
assert.ok(process.env.CHECK_HASH_SECRET && process.env.GEMINI_MODEL, "Konfigurasi check lokal diperlukan untuk fixture cache.");
const scope = `itest_browser_${randomUUID().replaceAll("-", "")}`;
const socket = createServer(); socket.listen(0, "127.0.0.1"); await once(socket, "listening");
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, CHECK_BUDGET_NAMESPACE: scope, CHECK_TRUSTED_IP_HEADER: "", PUBLIC_CHECK_ENABLED: "true", GEMINI_ANALYSIS_ENABLED: "true", FACTCHECK_SEARCH_ENABLED: "true", PUBLIC_URL_CHECK_ENABLED: "true", WEB_SEARCH_ENABLED: "false", CEKFAKTA_BASE_URL: base, CEKFAKTA_CHECK_TEST_SCOPE: scope };
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, windowsHide: true, stdio: "ignore" });
const operator = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const records = [];
const fixtureMarker = `FIXTURE QA FIKTIF ${randomUUID()}`;
const ownedReports = new Set();
const errors = [];
let browser; let user; let stage = "startup";
function sql(statement) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_02_CEKFAKTA_AGENTIC_WORKSPACE", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}
async function check(name, fn) { stage = name; await fn(); records.push(name); console.log(`PASS: ${name}`); }
async function audit(page, label) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], `Aksesibilitas ${label}`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow ${label}`);
}
async function open(page, path) { await page.goto(`${base}${path}`); await page.locator("h1").first().waitFor(); }
try {
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error("Server acceptance berhenti.");
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* Startup. */ }
    if (i === 79) throw new Error("Server acceptance tidak siap.");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  await mkdir("artifacts/qa", { recursive: true });
  for (const [name, script] of (process.argv.includes("--browser-only") ? [] : [["HTTP/Auth/RLS/editorial/cache", "test-supabase-local.mjs"], ["smoke tanpa provider", "smoke.mjs"]])) {
    await check(name, async () => {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [`scripts/${script}`], { env, windowsHide: true, stdio: "inherit" });
        child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Acceptance ${script} gagal (${code}).`)));
      });
    });
  }
  const password = `Qa-${randomUUID()}-Aa9!`;
  const created = await operator.auth.admin.createUser({ email: `qa-browser-${randomUUID()}@example.test`, password, email_confirm: true });
  assert.equal(created.error, null); user = created.data.user;
  assert.match(user.id, /^[a-f0-9-]{36}$/);
  sql(`insert into public.admin_users(user_id) values ('${user.id}');`);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage(); page.on("pageerror", () => errors.push("browser runtime error"));
  await check("responsif + axe Home/check/reports/login 360/390/768/1280/1440", async () => {
    for (const width of [360, 390, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      for (const path of ["/", "/check", "/reports", "/admin/login"]) {
        await open(page, path); await audit(page, `${path} ${width}`);
        if (path === "/" && [390, 1440].includes(width)) await page.screenshot({ path: `artifacts/qa/home-${width}.png`, fullPage: true, animations: "disabled" });
      }
    }
  });
  await check("keyboard, navigasi mobile dan reduced motion", async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await open(page, "/");
    await page.keyboard.press("Tab"); assert.match(await page.locator(":focus").innerText(), /Lewati|konten/i);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Tutup", exact: true }).getAttribute("aria-expanded"), "true");
    await page.getByRole("navigation", { name: "Navigasi utama" }).getByRole("link", { name: "Cek Berita" }).click();
    await page.waitForURL(`${base}/check`);
    await page.emulateMedia({ reducedMotion: "reduce" }); await open(page, "/");
    assert.equal(await page.locator(".hero-stage h1").evaluate(el => getComputedStyle(el).animationName), "none");
    assert.equal(await page.locator('[class*="comet"]').evaluateAll(nodes => nodes.every(el => getComputedStyle(el).display === "none")), true);
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });
  await check("validasi input, focus error dan loading/error tanpa provider", async () => {
    await open(page, "/check");
    let sent = 0; const count = request => { if (request.url() === `${base}/api/check`) sent++; }; page.on("request", count);
    await page.getByRole("button", { name: "Periksa Sekarang" }).click(); await page.locator(".alert.error").waitFor();
    assert.equal(sent, 0); assert.equal(await page.locator(":focus").getAttribute("aria-invalid"), "true");
    await page.getByLabel("Tautan berita", { exact: true }).check(); await page.getByLabel("Tautan artikel").fill("bukan-url");
    await page.getByRole("button", { name: "Periksa Sekarang" }).click(); await page.locator(".alert.error").waitFor(); assert.equal(sent, 0);
    await page.getByLabel("Teks berita", { exact: true }).check();
    await page.getByLabel("Klaim yang ingin diperiksa").fill("Fixture fiktif khusus pengujian antarmuka, bukan berita nyata.");
    let release; const blocked = new Promise(resolve => { release = resolve; });
    await page.route("**/api/check", async route => { await blocked; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Fixture: layanan sementara tidak tersedia." } }) }); });
    await page.getByRole("button", { name: "Periksa Sekarang" }).click();
    assert.equal(await page.getByRole("button", { name: "Memproses klaim" }).isDisabled(), true);
    assert.equal(await page.getByLabel("Klaim yang ingin diperiksa").isDisabled(), true);
    release(); await page.locator(".alert.error").waitFor(); assert.equal(sent, 1);
    assert.match(await page.locator(".alert.error").innerText(), /Fixture/);
    await page.unroute("**/api/check"); page.off("request", count);
  });
  await check("hasil cache DB nyata tetap unverified/draft + sumber kosong jujur", async () => {
    const input = { inputType: "text", input: `Fixture browser ${randomUUID()}: klaim fiktif untuk pengujian, bukan berita nyata.`, category: "education" };
    const hashes = checkHashes(input, "fixture", process.env.CHECK_HASH_SECRET, process.env.GEMINI_MODEL);
    const reserved = await operator.rpc("reserve_check", { p_scope: scope, p_key: hashes.key, p_subject: hashes.subject, p_url: false });
    assert.equal(reserved.error, null); assert.equal(reserved.data.status, "reserved");
    const draft = { claim: input.input, category: "education", verdict: "unverified", reviewStatus: "draft", summary: "Fixture pengujian browser.", reason: "Tidak ada bukti nyata dalam fixture ini.", limitations: ["Fixture fiktif, bukan pemeriksaan fakta nyata."], evidenceIds: [] };
    const completed = await operator.rpc("complete_check", { p_scope: scope, p_key: hashes.key, p_token: reserved.data.token, p_document: { ...buildAnalysisDocument({ status: "no_evidence", sources: [], draft }), limitations: draft.limitations }, p_input_type: "text", p_url: null, p_analysis: false });
    assert.equal(completed.error, null); ownedReports.add(completed.data.id);
    await page.getByLabel("Klaim yang ingin diperiksa").fill(input.input);
    const received = page.waitForResponse(r => r.url() === `${base}/api/check`);
    await page.getByRole("button", { name: "Periksa Sekarang" }).click();
    const response = await received; assert.equal(response.status(), 200); assert.equal((await response.json()).cached, true);
    const result = page.getByRole("status", { name: "Hasil awal pemeriksaan" }); await result.waitFor();
    assert.match(await result.innerText(), /Belum dapat diverifikasi/); assert.match(await result.innerText(), /Belum ada kandidat/);
    assert.equal((await fetch(`${base}/reports/${completed.data.id}`)).status, 404);
    await audit(page, "hasil awal mobile"); await page.screenshot({ path: "artifacts/qa/check-result-mobile.png", fullPage: true });
  });
  await check("login admin, CRUD UI, approval, XSS escaping dan konfirmasi", async () => {
    await open(page, "/admin/login");
    await page.getByLabel("Email admin").fill(user.email); await page.getByLabel("Kata sandi", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Tampilkan kata sandi" }).click(); assert.equal(await page.getByLabel("Kata sandi", { exact: true }).getAttribute("type"), "text");
    await page.getByRole("button", { name: "Masuk sebagai admin" }).click(); await page.waitForURL(`${base}/admin`);
    await audit(page, "antrean mobile"); await page.getByRole("link", { name: "Buat draft" }).click();
    const claim = `${fixtureMarker}: <img src=x onerror="window.__qaXss=1"> bukan klaim berita nyata.`;
    await page.getByLabel("Klaim yang diperiksa").fill(claim);
    await page.getByLabel("Ringkasan publik").fill("Fixture browser fiktif; bukan hasil verifikasi nyata.");
    await page.getByLabel("Penjelasan dan hubungan bukti").fill("Fixture pengujian alur editorial. Sumber example.org hanya penanda fixture.");
    await page.getByLabel("Catatan internal (khusus admin)").fill("QA_PRIVATE_NOTE");
    await page.getByRole("button", { name: "Tambah sumber", exact: true }).click();
    await page.getByLabel("URL sumber", { exact: true }).fill("https://example.org/qa-fixture");
    await page.getByLabel("Judul sumber", { exact: true }).fill("Fixture sumber fiktif, bukan bukti nyata");
    await page.getByRole("button", { name: "Simpan draft", exact: true }).click();
    await page.waitForURL(new RegExp(`${base}/admin/[a-f0-9-]{36}$`)); const id = new URL(page.url()).pathname.split("/").pop(); ownedReports.add(id);
    await page.getByRole("heading", { name: "Keputusan editorial" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Setujui dan publikasikan" }).isDisabled(), true);
    await audit(page, "editor mobile");
    await page.getByLabel("Ringkasan publik").fill("Fixture browser fiktif setelah edit; bukan hasil verifikasi nyata.");
    await page.getByRole("button", { name: "Simpan draft", exact: true }).click();
    await page.getByRole("heading", { name: "Keputusan editorial" }).waitFor();
    assert.equal(await page.getByLabel("Ringkasan publik").inputValue(), "Fixture browser fiktif setelah edit; bukan hasil verifikasi nyata.");
    await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Setujui dan publikasikan" }).click();
    await page.getByRole("button", { name: "Tarik publikasi ke draft" }).waitFor();
    const guest = await context.newPage(); guest.on("pageerror", () => errors.push("guest runtime error"));
    await open(guest, "/reports");
    await guest.getByLabel("Cari klaim", { exact: true }).fill(fixtureMarker);
    await guest.getByLabel("Kategori", { exact: true }).selectOption("education");
    await guest.getByLabel("Hasil pemeriksaan", { exact: true }).selectOption("unverified");
    await guest.getByRole("button", { name: "Tampilkan", exact: true }).click();
    await guest.getByRole("link", { name: claim, exact: true }).waitFor();
    assert.match(guest.url(), /category=education/); await audit(guest, "daftar filtered mobile");
    await guest.screenshot({ path: "artifacts/qa/reports-fixture-mobile.png", fullPage: true });
    await guest.setViewportSize({ width: 1440, height: 960 }); await audit(guest, "daftar filtered desktop");
    await guest.screenshot({ path: "artifacts/qa/reports-fixture-desktop.png", fullPage: true });
    await guest.setViewportSize({ width: 390, height: 844 });
    await open(guest, `/reports/${id}`); assert.equal(await guest.locator("h1").innerText(), claim);
    assert.equal(await guest.evaluate(() => window.__qaXss), undefined); assert.doesNotMatch(await guest.locator("body").innerText(), /QA_PRIVATE_NOTE/);
    await audit(guest, "detail mobile"); await guest.screenshot({ path: "artifacts/qa/report-fixture-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 960 }); await audit(page, "editor desktop");
    await guest.setViewportSize({ width: 1440, height: 960 }); await audit(guest, "detail desktop");
    page.once("dialog", dialog => dialog.dismiss()); await page.getByRole("button", { name: "Tarik publikasi ke draft" }).click();
    assert.equal((await fetch(`${base}/api/reports/${id}`)).status, 200);
    page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Tarik publikasi ke draft" }).click();
    await page.getByRole("button", { name: "Arsipkan draft" }).waitFor(); assert.equal((await fetch(`${base}/api/reports/${id}`)).status, 404);
    page.once("dialog", dialog => dialog.dismiss()); await page.getByRole("button", { name: "Arsipkan draft" }).click();
    assert.equal(await page.getByRole("button", { name: "Arsipkan draft" }).isVisible(), true);
    page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Arsipkan draft" }).click();
    await page.getByRole("button", { name: "Kembalikan ke draft" }).waitFor(); await page.getByRole("button", { name: "Kembalikan ke draft" }).click();
    await page.getByRole("button", { name: "Arsipkan draft" }).waitFor();
    await open(page, "/admin");
    await page.getByRole("button", { name: "Keluar", exact: true }).click(); await page.waitForURL(`${base}/admin/login`);
    await guest.close();
  });
  await check("header keamanan dan tidak ada runtime error", async () => {
    const response = await fetch(base); assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY"); assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.deepEqual(errors, []);
  });
  await writeFile("artifacts/qa/results.json", JSON.stringify({ testedAt: new Date().toISOString(), browser: browser.version(), checks: records, fixture: "Fiktif; seluruh fixture dihapus setelah pengujian.", providersCalled: false }, null, 2));
  console.log("PASS: QA lokal selesai, bukti di artifacts/qa (diabaikan Git).");
} catch (error) {
  console.error(`FAIL: ${stage}`);
  // No network bodies, session cookies, keys or credentials in failure logs.
  console.error(error instanceof Error ? error.message.slice(0, 1800) : "Pengujian gagal.");
  process.exitCode = 1;
} finally {
  await browser?.close();
  try {
    const ids = sql(`select report_id from private.check_jobs where scope='${scope}' and report_id is not null;`).trim().split(/\s+/).filter(Boolean);
    ids.forEach(id => ownedReports.add(id));
    if (user) {
      const created = await operator.from("reports").select("id").like("claim", `${fixtureMarker}%`);
      assert.equal(created.error, null); created.data.forEach(row => ownedReports.add(row.id));
    }
    for (const id of ownedReports) {
      assert.match(id, /^[a-f0-9-]{36}$/);
      sql(`delete from public.report_audit where report_id='${id}'; delete from public.reports where id='${id}'; delete from public.report_audit where detail->>'deleted_report_id'='${id}';`);
    }
    sql(`delete from private.check_jobs where scope='${scope}'; delete from private.check_counters where scope='${scope}';`);
    if (user) { const result = await operator.auth.admin.deleteUser(user.id); assert.equal(result.error, null); }
    console.log("CLEANUP: fixture/akun/namespace uji dihapus; akun pengguna tetap utuh.");
  } catch { console.error("CLEANUP gagal: periksa fixture qa-browser/itest_browser di Supabase lokal."); process.exitCode = 1; }
  if (server.exitCode === null) { server.kill(); await once(server, "exit"); }
}
