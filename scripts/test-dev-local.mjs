// Regresi untuk loop HMR: menguji server dev yang SUDAH berjalan, tanpa provider/DB writes.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.CEKFAKTA_BASE_URL || "http://127.0.0.1:43001";
const url = new URL(base);
assert.ok(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname), "Tes dev hanya untuk loopback.");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  let navigations = 0;
  let restarts = 0;
  page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations++; });
  page.on("pageerror", () => errors.push("runtime_error"));
  page.on("websocket", socket => socket.on("framereceived", ({ payload }) => {
    try {
      const message = JSON.parse(String(payload));
      if (message.type === "turbopack-message" && message.data?.some(item => item.type === "restart")) restarts++;
    } catch { /* Binary RSC frames are not HMR status messages. */ }
  }));
  await page.goto(`${url.origin}/`, { waitUntil: "load", timeout: 60000 });
  // Cold compilation/HMR setup can cause an initial navigation. The idle
  // observation window starts after it settles; repeated reloads must stop.
  await new Promise(resolve => setTimeout(resolve, 3000));
  const before = { navigations, restarts };
  await new Promise(resolve => setTimeout(resolve, 12000));
  assert.equal(navigations - before.navigations, 0, "Halaman masih reload tanpa perubahan source.");
  assert.equal(restarts - before.restarts, 0, "HMR masih meminta restart saat idle.");
  assert.equal(await page.evaluate(() => document.readyState), "complete");
  assert.equal(await page.locator('[aria-busy="true"]').count(), 0, "Loading halaman tidak selesai.");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Tutup", exact: true }).getAttribute("aria-expanded"), "true");
  await page.getByRole("navigation", { name: "Navigasi utama" }).getByRole("link", { name: "Cek Berita", exact: true }).click();
  await page.waitForURL(`${url.origin}/check`);
  await page.getByRole("button", { name: "Periksa Sekarang" }).click();
  await page.locator(".alert.error").waitFor();
  assert.equal(await page.getByLabel("Klaim yang ingin diperiksa").evaluate(el => el === document.activeElement), true);
  assert.deepEqual(errors, [], "Terdapat error runtime browser.");
  console.log("PASS: server dev stabil, 0 navigasi/restart saat idle 12 detik; menu, navigasi dan validasi form berfungsi. Tanpa provider atau penulisan DB.");
} catch (error) {
  console.error(error instanceof Error ? error.message.slice(0, 700) : "QA dev gagal.");
  process.exitCode = 1;
} finally {
  await browser.close();
}
