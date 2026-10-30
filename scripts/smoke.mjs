// Run after `npm run dev`, in another terminal. No external API key required.
import assert from "node:assert/strict";
const base = process.env.CEKFAKTA_BASE_URL || "http://localhost:3000";
for (const path of ["/", "/check", "/reports", "/admin/login"]) {
  const page = await fetch(`${base}${path}`);
  assert.equal(page.status, 200, path);
  assert.match(await page.text(), /CekFakta|Cek<!-- -->/);
}
assert.equal((await fetch(`${base}/reports/missing`)).status, 404);
const admin = await fetch(`${base}/admin`, { redirect: "manual" });
assert.equal(admin.status, 307);
assert.equal(admin.headers.get("location"), "/admin/login");
const health = await fetch(`${base}/api/health`);
assert.equal(health.status, 200);
const data = await health.json();
assert.equal(data.mode, "integrated");
// No valid submission here: smoke must never consume live provider quota.
const forged = await fetch(`${base}/api/check`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({inputType:"text", input:"Klaim fiktif khusus uji penolakan payload.",category:"education",reviewStatus:"published"})});
assert.equal(forged.status, 400);
for (const input of ["", "terlalu pendek"]) {
  const rejected = await fetch(`${base}/api/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ inputType: "text", input, category: "education" }) });
  assert.equal(rejected.status, 400);
}
console.log("Smoke lulus: halaman publik, 404 laporan, redirect admin, health integrated, dan penolakan input tanpa memakai kuota provider.");
