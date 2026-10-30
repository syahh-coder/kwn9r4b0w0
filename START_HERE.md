# START HERE — persis yang dilakukan di IDE agentic

### 1. Copy dan jalankan
Di Windows PowerShell yang memblokir `npm.ps1`, gunakan `npm.cmd` untuk semua command npm di bawah. Tidak perlu mengubah execution policy.

```bash
npm install
npm run dev
# buka http://localhost:3000
```
Cek API: `http://localhost:3000/api/health` (liveness, bukan kesiapan provider). Di terminal kedua jalankan `npm.cmd run smoke` untuk menguji health dan penolakan input tanpa kuota provider. VS Code memiliki task `CekFakta: Dev Server`, `CekFakta: Full Checks` dan `CekFakta: Browser QA`. Untuk workspace yang sudah disiapkan, nyalakan Docker Desktop lalu `npx.cmd supabase start`; jangan reset DB atau menimpa `.env.local`. Panduan terbaru: [QA lokal](docs/20_LOCAL_QA_RELEASE.md).

### 2. Tempel prompt awal di AI agent
"""
Baca AGENTS.md, AI.md, docs/01_PRD.md, docs/02_ARCHITECTURE.md, docs/03_VALIDATION_POLICY.md,
TASKS.md, dan docs/TEAM.md. Jalankan prompts/00_EXECUTE_MVP.md berurutan.
Implementasikan fase pertama terlebih dahulu dengan perubahan kecil, lalu jalankan
npm run lint && npm run typecheck && npm test && npm run build.
Jangan pernah menandai berita valid/hoaks tanpa sumber bukti yang relevan dan pemeriksaan klaim.
Update TASKS.md beserta command dan hasil nyata.
"""

### 3. Credential
- `.env.local` (copy dari `.env.example`, tidak di-commit).
- `GEMINI_API_KEY`: buat sendiri di https://aistudio.google.com/api-keys.
- Supabase URL + anon key setelah project database dibuat. Admin harus via Supabase Auth dan RLS, bukan password hardcoded.
- Mode pencarian web memakai `TAVILY_API_KEY` dan `WEB_SEARCH_ENABLED=true`; [panduan DATA-04](docs/22_TAVILY_EVIDENCE.md). Harga dan batas ada di docs/21; tidak perlu mengaktifkan PAYG untuk mencoba kredit gratis yang masih tersedia.
- Hanya URL Supabase dan anon/publishable key yang boleh publik. Gemini, Tavily, Fact Check, key backend Supabase serta hash secret harus server-only, tanpa `NEXT_PUBLIC_`.

### 4. Setelah fitur dibangun
- Jalankan acceptance cases di `docs/09_TEST_PLAN.md` dan `npm.cmd run test:browser`.
- Tulis hasil pengujian sesungguhnya, lalu demo via `docs/10_DEMO_SCRIPT.md`.
