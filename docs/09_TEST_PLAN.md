# Acceptance + test plan

`NOT_RUN` is not a pass. Current scaffold has unit input tests only; agent must update after implementation.

| ID | Test case | Expected | Status |
|---|---|---|---|
| T01 | Load `/`, `/check`, `/reports` | Accessible on mobile, no fatal errors | NOT_RUN |
| T02 | Submit empty text | Clear validation error, no AI call | NOT_RUN |
| T03 | Submit text under 20 chars | 400 invalid_input | NOT_RUN |
| T04 | Submit invalid domain/URL | 400, no fetch | NOT_RUN |
| T05 | Submit a normal story with no relevant sources | UNVERIFIED, no invented references | NOT_RUN |
| T06 | Paraphrase same evidence-backed claim | Candidate evidence matched, contextual comparison | NOT_RUN |
| T07 | Reverse claim negation / different year | NOT automatically same verdict | NOT_RUN |
| T08 | Fetch localhost/127.0.0.1/169.254/redirect/internal IPv6 | Blocked BEFORE connection | NOT_RUN |
| T09 | Non-admin tries draft read/write | Access denied | NOT_RUN |
| T10 | Guest accesses published report | Can view report + sources; no draft | NOT_RUN |
| T11 | Admin publishes draft | Published after auth and audit log | NOT_RUN |
| T12 | AI API key missing/quota exceeded | Explicit service error or UNVERIFIED; no false claim | NOT_RUN |
| T13 | Concurrent duplicate submits | Idempotent/cached, no runaway quota | NOT_RUN |
| T14 | Dependency checks | lint, typecheck, tests, build succeed | PASS — 24 Oktober 2026 |

## Commands
### BE-03 — 24 Oktober 2026

- `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test` (82/82) dan `npm.cmd run build`: PASS. Tambahan pengujian validator/sink analisis/RPC editorial mencakup rollback atomik, catatan privat, invalid provenance, konflik versi, approval, arsip dan pemulihan.
- `npx.cmd supabase migration up --local`: PASS, migrasi 0004 diterapkan tanpa reset/cloud. Tidak mengganti akun admin pengguna.
- `npm.cmd run test:local`: PASS pada build lokal; HTTP daftar/detail/create/edit/publish/retract/DELETE-arsip/restore, guest 401/non-admin 403, CSRF 403, body 413/MIME 415/field injection 400, dua edit bersamaan 200/409, audit/catatan privat/provenance serta revocation/logout. Endpoint analisis diuji untuk penolakan auth/CSRF/schema saja; sink diuji lewat hasil fixture terinjeksi dan PostgREST aktual. Akun/laporan fixture dibersihkan.
- `npm.cmd run smoke`: PASS; public routes dan kontrak validation-only tetap utuh. Scan nilai key Gemini/Fact Check di bundle `.next/static`: tidak ditemukan.
- Tidak memanggil provider live pada sesi ini, tidak mengaktifkan flag/billing atau memigrasi cloud. Review visual/interaksi browser belum diuji. Published sudah berlaku pada RLS/database; halaman reports publik menunggu FE-02 dan pemeriksaan publik menunggu INT-01.

### Provider live DATA-03 — 24 Oktober 2026

- `npm.cmd run test:factcheck`: PASS, satu request HTTP 200, 5 kandidat nyata. Normalisasi dan payload provenance lulus; replay query memakai cache tanpa request tambahan. Dua contoh URL/publisher dan tanggal null dicatat pada docs/04_DATA_SOURCES.md, bukan respons mentah atau key.
- `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test` (72/72) dan `npm.cmd run build`: PASS.
- Scan nilai key Fact Check pada `.next/static`: PASS, tidak ditemukan; nilai key tidak dicetak.
- Tidak memanggil Gemini, mengambil artikel, menulis database, mengubah environment/billing atau mengaktifkan jalur publik. Regresi GoTrue/PostgREST tidak diulang karena tidak ada perubahan DB/Auth/RPC; unit/SQL dijalankan ulang. Bukti persistensi aktual tetap hasil test:local sesi migrasi 0003.
- Kuota/biaya console belum dikonfirmasi. Probe membuktikan akses metadata dan kontrak adapter, bukan akurasi verdict, kelengkapan indeks atau kemampuan end-to-end /check.

### Penyelesaian modul AI-01 — 24 Oktober 2026

- PASS: lint, typecheck, 72/72 unit/SQL test dan build final; key Gemini tidak ditemukan pada .next/static.
- PASS: `npm.cmd run test:gemini` pada gemini-3.5-flash-lite. Uji awal dua request sukses; probe final tiga request sukses (ekstraksi + JSON/citation analysis + full-text comparison dengan quote/hash/span). Fixture fiktif, tidak mengambil URL atau menulis database. Ini bukti integrasi SDK/schema, bukan ground truth atau benchmark kualitas.
- 8 test full-text baru: pemetaan ID/URL dokumen, bounded text, quote literal/utuh/unik, relasi tanpa quote ditolak, source omission/extra verdict ditolak, injection/error/quota/timeout, pipeline gagal jika citation palsu dan final unverified pada perbedaan tahun/negasi/konteks.
- AI-01 DONE untuk modul server; verdict otomatis konservatif unverified/draft dan usulan model hanya internal. Pencarian provider nyata DATA-03, report save/CRUD BE-03, serta API/UI publik INT-01 belum dinyatakan selesai. T05–T07/T12 end-to-end publik tetap belum PASS. Tidak mengubah hasil 404 historis menjadi pass; model baru diuji terpisah.

### Lanjutan AI-01 ekstraksi/pipeline — 24 Oktober 2026

9 test tambahan, total 64/64 unit/SQL lulus: exact quote + whole-sentence/span/hash, preservasi negasi/tahun, actor/location/time literal/null, waktu relatif, no-claim, prompt isolation/error, context flags dan pipeline terinjeksi. `npm.cmd run check:gemini` PASS metadata saja. Probe `npm.cmd run test:gemini` dijalankan dua kali, masing-masing satu request ekstraksi fixture, keduanya gagal HTTP 404; analisis live tidak dijalankan. Tidak menandai acceptance generasi sebagai PASS. Tidak ada report tersimpan atau route publik berubah. Model/env/billing tidak diganti; AI-01 tetap IN_PROGRESS.

### AI-01 terisolasi — 24 Oktober 2026

9 test generator fiktif pada tests/evidence-analysis.test.mjs; total 55/55 lulus. Memeriksa no-evidence tanpa model call, kegagalan provider terpisah, schema/claim/category/draft, citation allowlist, invented URL, extra confidence, injection, metadata downgrade, error kuota dan deadline. Semua final verdict metadata tetap unverified. Tidak memanggil SDK network, menilai kualitas model nyata, menulis report, atau membuka API publik. Detail: docs/14_GEMINI_ANALYSIS.md. T05–T07/T12 pipeline end-to-end tetap belum dinyatakan PASS.

### Persistensi DATA-03 — 24 Oktober 2026

Migrasi 0003, repository sumber dan RPC batch diuji pada PGlite serta Supabase lokal sebenarnya. Unit test total 46/46 lulus; lint/typecheck/build lulus. `npm.cmd run test:local` lulus: provenance tanggal/atribusi, dua RPC concurrent menghasilkan tepat satu insert, replay nol insert, rollback batch invalid, anon/non-admin ditolak dan published tidak dapat ditambah sumber. Regresi Auth/RLS/publish/retract/logout serta smoke HTTP lulus. Fixture dibersihkan. Tidak ada live request Google, verifikasi relevansi nyata, shared budget, Gemini, atau API publik baru.

### DATA-02 internal — 24 Oktober 2026

12 test pada tests/article-ingestion.test.mjs menguji IP/URL/DNS/redirect/pinning/byte cap/MIME/encoding/timeout serta ekstraksi teks. Total npm.cmd test 41/41 lulus. Seluruh request/resolver memakai test seam/stream fixture; tidak melakukan koneksi socket/TLS live dan tidak mengakses alamat privat. T08 baru lulus pada tingkat kebijakan dan transport terinjeksi, bukan acceptance publik/deployment. Public ingestion tetap nonaktif sampai rate limit/review tersedia. Lihat docs/12_URL_INGESTION.md.

### Adapter kandidat referensi — 24 Oktober 2026

Tujuh test baru pada tests/fact-check-search.test.mjs memakai fixture fiktif dan fetch terinjeksi, tanpa API eksternal. Seluruh npm.cmd test 29/29 lulus: endpoint/headers/opsi bounded, provenance/null timestamp, URL metadata, dedupe, cache defensif/expiry/concurrency, pemisahan negasi/tahun, serta quota/network/JSON/MIME/content cap. Ini bukan bukti kualitas pencarian nyata, verifikasi semantik, SSRF DNS/connect, persistensi sumber, atau pipeline Gemini.

### Hasil BE-01/BE-02 Supabase aktual — 24 Oktober 2026

- Lint tanpa warning, typecheck, build lulus; npm.cmd test 22/22 lulus. Smoke HTTP publik dan redirect admin lulus pada build final port 3100.
- npm.cmd run test:local lulus: migrasi 0001/0002 terpasang, dua user GoTrue sementara, JWT lewat Data API/RLS, admin publish/retract, isolasi private notes/audit, HTTP guest session 401, non-admin 403, admin 200, password salah ditolak, Origin asing ditolak, cookie HttpOnly/SameSite=Lax, allowlist dicabut langsung 403, logout menghapus cookie.
- Seluruh fixture dihapus setelah test. Script hanya menerima loopback; tidak menjalankan migrasi cloud atau mencetak secret CLI. Nilai Gemini key tidak ditemukan pada aset client .next/static hasil build final.
- T09: PASS untuk read/write Data API/RLS dan guard sesi; CRUD API admin BE-03 belum ada. T10/T11: PASS bagian database/Data API pada fixture sementara; daftar/detail publik dan alur publish lewat aplikasi belum tersedia. T05–T08, T12–T13 pipeline nyata tetap NOT_RUN. Status NOT_RUN pada tabel awal menunjukkan acceptance end-to-end penuh belum selesai.
- Belum diuji: interaksi browser/visual, expiry sesi dengan waktu nyata, Vercel dan cloud. Auth tidak lagi placeholder; dashboard hanya shell terlindungi tanpa CRUD.

### Hasil BE-01 lokal — 24 Oktober 2026

`tests/database-rls.test.mjs` menerapkan migrasi 0001 dan 0002 pada PostgreSQL tersemat PGlite. Delapan subtest mencakup pelestarian catatan lama dan cascade delete, grants, isolasi draft/sumber/catatan/audit, eskalasi role, larangan publikasi background worker, penerbit yang dipaksa database, larangan edit published, retraction, serta publish tanpa sumber. Hasil akhir `npm.cmd test`: 20/20 lulus (11 test input + 8 subtest database + 1 induk). Lint, typecheck, build lulus. Ini bukti SQL lokal untuk sebagian T09–T11; acceptance Supabase Auth/Data API T09–T11 tetap NOT_RUN sampai koneksi dev tersedia. Fixture auth bukan pengujian JWT nyata.

### Hasil tahap lokal — 24 Oktober 2026

- `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test` (11/11), `npm.cmd run build`: lulus.
- `npm.cmd run start -- --port 3000` dan `npm.cmd run smoke`: lulus pada build produksi. Empat halaman 200, detail tidak ada 404, admin redirect 307 ke login, health scaffold, input kosong/pendek 400, hasil validation-only unverified tanpa sources atau reviewStatus.
- T01 hanya diperiksa lewat HTTP; interaksi browser, keyboard dan viewport 360/390/768/1280/1440 belum diuji. T02/T03 diperiksa pada parser/API; alur klik frontend belum diuji browser.
- T14 PASS. T05–T13 tetap NOT_RUN untuk pipeline nyata. Redirect placeholder admin bukan bukti Supabase Auth/RLS. Tidak ada klaim pengujian SSRF atau analisis Gemini.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Unit test cases provided today
`tests/check-input.test.mjs`: text length, category, invalid URL, malicious URL shape. **These are not URL SSRF connection tests**.
