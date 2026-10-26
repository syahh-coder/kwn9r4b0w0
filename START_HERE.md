# START HERE — persis yang dilakukan di IDE agentic

### 1. Copy dan jalankan
Di Windows PowerShell yang memblokir `npm.ps1`, gunakan `npm.cmd` untuk semua command npm di bawah. Tidak perlu mengubah execution policy.

```bash
npm install
npm run dev
# buka http://localhost:3000
```
Cek API: `http://localhost:3000/api/health`. Di terminal kedua jalankan `npm run smoke` untuk menguji health & input-validation-only. VS Code memiliki task `CekFakta: Dev Server` dan `CekFakta: Full Checks`.

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
- Pastikan tidak pernah menaruh kunci di NEXT_PUBLIC_ atau frontend.

### 4. Setelah fitur dibangun
- Jalankan 12 acceptance cases di `docs/09_TEST_PLAN.md`.
- Tulis hasil pengujian sesungguhnya, lalu demo via `docs/10_DEMO_SCRIPT.md`.
