# CEKFAKTA — Agentic Web Project Workspace

**Project kuliah Kewarganegaraan: portal edukasi dan verifikasi klaim tentang Pendidikan, Politik, dan Konservasi Alam.**

> Status: **starter scaffold + dokumentasi + backlog**, BUKAN situs fact-check yang sudah berfungsi. Endpoint `/api/check` saat ini memvalidasi bentuk input dan mengembalikan `unverified` sebagai hasil **belum diperiksa**, bukan vonis benar/hoaks. Fetch URL, pencarian bukti, Gemini, Supabase, login admin, dan publishing adalah task implementasi berikutnya. Tidak ada API key disertakan.

## Mulai cepat
1. Ekstrak zip, buka folder `02_CEKFAKTA_AGENTIC_WORKSPACE` di IDE.
2. Install **Node.js 20.9+** dan npm, lalu: `npm install` → `npm run dev`.
3. Buka `http://localhost:3000`. UI starter dan API health akan berjalan tanpa API key; belum ada validasi fakta nyata.
4. Duplikasi `.env.example` menjadi `.env.local`, isi credential sendiri saat akan mengaktifkan fitur.
5. Ke agent di IDE, paste isi `prompts/00_EXECUTE_MVP.md`. Instruksikan agent jalankan fase 1, verifikasi, lanjut sesuai urutan backlog.

## Repo map
- `AGENTS.md` = kontrak utama AI agent lintas IDE; `AI.md` = peta konteks & prompt.
- `.cursor/rules/*.mdc`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` = dukungan multi-agent/IDE.
- `docs/` = PRD, architecture, validation policy, data source, API, DB, security, testing, demo.
- `TASKS.md` & `docs/TEAM.md` = owner, dependensi, bukti selesai.
- `src/app` = Next.js App Router (halaman & route handler starter).
- `supabase/migrations/` = draft struktur DB dan RLS yang harus direview sebelum diterapkan.
- `tests/` = test awal Node test runner, tanpa memerlukan layanan eksternal.
- `.vscode/` = task run dev / full checks di VS Code dan IDE kompatibel; `scripts/smoke.mjs` = smoke test terhadap server lokal.

## Scope / kebijakan produk
- Dua menu publik: **Cek Berita** dan **Report**. User tanpa login. Admin dengan login dan hak untuk add/edit/delete/approve report.
- Report dihasilkan **sebagai draft**, tidak auto publish. Ada 3 verdict: `hoax` / `valid` / `unverified`.
- Gemini **bukan sumber kebenaran**: verdict harus memiliki bukti relevan, tautan valid, metadata, waktu dan konteks. Sumber yang tidak ditemukan → `unverified`.
- Rate limit dan SSRF protection wajib sebelum meluncurkan endpoint publik yang aktif mengambil URL.
- Politik adalah topik berisiko tinggi: hindari putusan otomotis tanpa bukti dan admin review.

## Tech decisions
Next.js App Router + TypeScript + CSS starter → Next.js Route Handlers → Gemini `@google/genai` (server only, phase 3) → Supabase Postgres/Auth (phase 2) → hosting Vercel (opsional). Package minimal agar instalasi pertama tidak rumit; upgrade dependencies setelah audit.

**Jangan gunakan report demo sebagai fakta publik.** Saat ini daftar report publik menampilkan empty state sampai query DB/publikasi diimplementasikan.
