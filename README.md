# CEKFAKTA — Agentic Web Project Workspace

**Project kuliah Kewarganegaraan: portal edukasi dan verifikasi klaim tentang Pendidikan, Politik, dan Konservasi Alam.**

> Status implementasi lokal: Home/form, safe URL ingestion, metadata Google Fact Check, pencarian/baca sumber Tavily, analisis Gemini server, draft di Supabase, laporan publik dan admin editorial. Mode web memerlukan flag/key server; [konfigurasi, batas dan bukti](docs/22_TAVILY_EVIDENCE.md). Semua hasil otomatis **unverified/draft**; hanya admin yang dapat menerbitkan laporan setelah review. Status terbaru ada di [TASKS.md](TASKS.md). Belum deploy cloud; key tidak disertakan.

## Mulai cepat
1. Buka repository di IDE, gunakan Node.js yang memenuhi `package.json` dan `npm.cmd ci` untuk instalasi sesuai lockfile.
2. Untuk instalasi baru, salin `.env.example` ke `.env.local` dan isi konfigurasi. **Pertahankan `.env.local` yang sudah ada**. Panduan [admin](docs/11_ADMIN_SETUP.md) dan [check](docs/19_CHECK_INTEGRATION.md).
3. Nyalakan Docker Desktop, lalu `npx.cmd supabase start`. Data dan admin lokal bertahan; tidak perlu reset atau membuat admin ulang.
4. Jalankan `npm.cmd run dev` dan buka URL pada terminal. UI bisa dibuka tanpa provider, tetapi check yang belum dikonfigurasi memberi error layanan yang jujur.
5. Panduan pengujian, demo dan batas rilis: [QA lokal](docs/20_LOCAL_QA_RELEASE.md). `npm.cmd run verify` menjalankan lint/typecheck/tests/build; `npm.cmd run test:browser` menjalankan acceptance lokal dan Chromium.

Development memakai Webpack untuk menghindari loop hot reload Turbopack yang ditemukan di workspace Windows ini. Jika port 3000 ditolak, jalankan `npm.cmd run dev -- --port 43001`. Dengan server aktif, `npm.cmd run test:dev` menguji browser tidak terus reload saat idle.

## Repo map
- `AGENTS.md` = kontrak utama AI agent lintas IDE; `AI.md` = peta konteks & prompt.
- `.cursor/rules/*.mdc`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` = dukungan multi-agent/IDE.
- `docs/` = PRD, architecture, validation policy, data source, API, DB, security, testing, demo.
- `TASKS.md` & `docs/TEAM.md` = owner, dependensi, bukti selesai.
- `src/app` = Next.js App Router: halaman publik/admin serta route handlers.
- `supabase/migrations/` = migrasi 0001–0007 untuk DB, RLS, editorial, shared check pipeline dan provenance/budget web; ditinjau sebelum diterapkan ke lingkungan lain.
- `tests/` = unit/adversarial/SQL dengan Node test runner; `scripts/` = acceptance Supabase/HTTP/browser dan probe provider opt-in.
- `.vscode/` = task run dev / full checks di VS Code dan IDE kompatibel; `scripts/smoke.mjs` = smoke test terhadap server lokal.

## Scope / kebijakan produk
- Dua menu publik: **Cek Berita** dan **Report**. User tanpa login. Admin dengan login dan hak untuk add/edit/delete/approve report.
- Report dihasilkan **sebagai draft**, tidak auto publish. Ada 3 verdict: `hoax` / `valid` / `unverified`.
- Gemini **bukan sumber kebenaran**: verdict harus memiliki bukti relevan, tautan valid, metadata, waktu dan konteks. Sumber yang tidak ditemukan → `unverified`.
- Rate limit dan SSRF protection wajib sebelum meluncurkan endpoint publik yang aktif mengambil URL.
- Politik adalah topik berisiko tinggi: hindari putusan otomotis tanpa bukti dan admin review.

## Tech decisions
Next.js App Router + TypeScript + shared CSS → server Route Handlers → Gemini `@google/genai` + Google Fact Check + Tavily opsional → Supabase Postgres/Auth. Cache, lease dan budget bersama memakai PostgreSQL; deployment Vercel/Supabase cloud tetap tahap terpisah. [Harga pencarian/token](docs/21_WEB_SEARCH_PRICING.md); agen tidak mengaktifkan paid plan.

**Jangan gunakan report demo sebagai fakta publik.** Daftar laporan hanya membaca data published; kosong jika belum ada persetujuan admin. Tidak ada cron penarik semua berita setiap hari: pipeline berjalan saat pengguna mengirim input, kemudian memakai cache untuk input identik.
