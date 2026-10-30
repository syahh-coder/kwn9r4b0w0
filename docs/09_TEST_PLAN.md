# Acceptance + test plan

`NOT_RUN` bukan lulus. Bukti terbaru mencakup unit/SQL, acceptance HTTP/Auth/RLS serta Chromium/axe dan review screenshot lokal. Fixture terinjeksi tidak dianggap benchmark akurasi/relevansi provider nyata; deployment terpisah.

## DATA-05 — perbaikan kegagalan input pengguna

Log dev pengguna: dua POST check 503 dengan label comparison/invalid_quote; tidak mencetak input/key/respons model. Schema ID kalimat sebelumnya memakai rentang global; diperbaiki menjadi varian evidenceId + enum ID quotable sumber itu, atau hanya unclear/null bila tidak ada kalimat layak. Tambah regresi dokumen dengan navigasi pendek dan dokumen berbeda tanpa kalimat layak; semua guard literal/hash/span lama tetap berlaku.

Uji satu input PISA pada web pengguna 43001: HTTP 200, cached false, 3 sumber isi/3 quote, report 2b0176c2-e0c5-4c9e-a0ef-940e24c34893 unverified/draft. Uji browser formulir 390px: cached true pada ID sama, 3 blockquote tampil, label unverified dan tanpa overflow. Tidak memanggil provider saat replay. Draft contoh nyata sengaja tetap tersedia bagi admin, tidak dipublikasikan. Tidak memiliki teks lengkap input pengguna yang gagal, sehingga tidak mengklaim reproduksi persis teks tersebut. Bukti checks/status akhir mengikuti TASKS.md.

`npm.cmd run verify` akhir PASS lint/typecheck/**117 unit+SQL**/build. Server Webpack pengguna direstart setelah build pada 43001. Tidak mengubah key, billing, budget, akun admin atau database cloud. Perubahan hanya mengikat pilihan quote pada sumber; UI/Auth/RLS tidak diubah dan suite browser lengkap sesi DATA-04 tidak diulang tanpa kebutuhan.

## DATA-04 — 31 Oktober 2026

- `npm.cmd run verify` PASS: lint, typecheck, **116/116 unit/SQL**, build. Tambahan guard query/tahun, safe web provider/body/error/Extract batch, provenance/hash/span, cache policy, service-only web reservation/lease/daily budget dan schema per-dokumen/ID kalimat.
- `npm.cmd run test:web-live` final PASS: satu klaim PISA 2022 pengguna -> 3 sumber berisi teks (hermananis.com, goodstats.id, lagirame.id), 3 kutipan literal, comparison, draft unverified atomik, hash/span DB, detail publik 404, replay API/browser cached, mobile tanpa overflow/runtime error dan axe PASS. Screenshot `artifacts/qa/web-live-mobile.png` diperiksa. Sumber ini bukan seluruhnya primer; tidak mengklaim fakta PISA/seluruh konteks sudah terbukti.
- Kegagalan awal dicatat: raw content kosong/halaman terpotong navigasi menghasilkan metadata atau unclear; passage dipilih kontinu pada batas kalimat asli. Model sempat melewatkan comparison dan mengubah/memotong quote; API gagal tertutup 503 tanpa draft. Schema kini wajib satu hasil per dokumen, model memilih nomor kalimat, server mengambil quote asli. Tidak melonggarkan guard, memaksa quote, atau retry otomatis.
- Basic Search + satu batch Extract opsional + safe-fetch paralel dibatasi; maksimal 2 Gemini/check. Seluruh namespace/draft probe dibersihkan, tidak publish/billing/PAYG/cloud/reset. Probe live bukan benchmark akurasi model, parafrasa T06, atau jaminan semua query menemukan dokumen primer.
- Scan akhir: 17 aset client dan 154 kandidat Git, 5 secret terkonfigurasi termasuk Tavily, **0 kecocokan**; nilai secret tidak dicetak. `.env.local` tetap diabaikan Git. Status layanan/aktivasi dan regresi browser akhir mengikuti TASKS.md.
- `npm.cmd run test:browser` akhir PASS lengkap: Auth/RLS/editorial/cache HTTP + smoke tanpa provider, Chromium/axe 5 viewport, keyboard/reduced motion, form, admin CRUD/approval/retraction/archive/restore/logout dan XSS escaping. Fixture/akun sementara dibersihkan. Flag Tavily kemudian diaktifkan lokal dan server Webpack direstart di 43001; `test:dev` PASS 0 navigasi/restart idle 12 detik. Query SQL sesudah cleanup: itest_web jobs/counters=0, migrasi lokal 0001–0007.

| ID | Test case | Expected | Status |
|---|---|---|---|
| T01 | Load `/`, `/check`, `/reports` | Accessible on mobile, no fatal errors | PASS — Chromium/axe Home/check/reports/login 360/390/768/1280/1440; screenshot dan keyboard, 31 Oktober 2026 |
| T02 | Submit empty text | Clear validation error, no AI call | PASS — klik browser, alert/focus input, nol request API, 31 Oktober 2026 |
| T03 | Submit text under 20 chars | 400 invalid_input | PASS — smoke/validator tanpa provider, 31 Oktober 2026 |
| T04 | Submit invalid domain/URL | 400, no fetch | PASS — validator/API unit, browser invalid URL tanpa request API, 31 Oktober 2026 |
| T05 | Submit a normal story with no relevant sources | UNVERIFIED, no invented references | PASS lokal — no_candidates pipeline terinjeksi + cache DB/hasil browser sumber kosong dan unverified/draft; bukan probe cerita/provider live, 31 Oktober 2026 |
| T06 | Paraphrase same evidence-backed claim | Candidate evidence matched, contextual comparison | NOT_RUN untuk relevansi semantik/provider live; guard citation/context/invented quote teruji lokal. Tidak menjanjikan kecocokan parafrasa otomatis |
| T07 | Reverse claim negation / different year | NOT automatically same verdict | PASS lokal — extractor mempertahankan negasi/tahun, cache terpisah, context flags/comparator memaksa unverified/draft; bukan benchmark model live, 31 Oktober 2026 |
| T08 | Fetch localhost/127.0.0.1/169.254/redirect/internal IPv6 | Blocked BEFORE connection | PASS — unit DNS/redirect/IPv6/cap + HTTP private IP lokal; transport hosting tujuan tetap QA, 31 Oktober 2026 |
| T09 | Non-admin tries draft read/write | Access denied | PASS — Auth/PostgREST/HTTP lokal, 30 Oktober 2026 |
| T10 | Guest accesses published report | Can view report + sources; no draft | PASS — API/SSR/Home, draft/retraction 404 termasuk cookie admin, 30 Oktober 2026 |
| T11 | Admin publishes draft | Published after auth and audit log | PASS — regresi BE-03 pada acceptance FE-02, 30 Oktober 2026 |
| T12 | AI API key missing/quota exceeded | Explicit service error or UNVERIFIED; no false claim | PASS — error guard unit + budget SQL/HTTP 429; bukan uji kuota eksternal habis, 31 Oktober 2026 |
| T13 | Concurrent duplicate submits | Idempotent/cached, no runaway quota | PASS — concurrent RPC reserved/processing, HTTP cache/replay satu draft dan live replay, 31 Oktober 2026 |
| T14 | Dependency checks | lint, typecheck, tests, build succeed | PASS — 103 tests, 31 Oktober 2026 |

## Commands
### DEV-01 — loop loading development

- Kasus pengguna setelah QA: HTTP 200 tidak membuktikan browser dev stabil. Chromium mereproduksi 36 navigasi dalam 12 detik, dengan event Turbopack restart/HMR berulang tanpa perubahan source. Tes browser QA-01 sebelumnya memakai `next start` (production), sehingga tidak mendeteksi kasus khusus `next dev`.
- Perbaikan: default `npm.cmd run dev` memakai `next dev --webpack`, berdasarkan CLI dokumentasi yang dibundel versi Next terpasang. Ini workaround terbukti pada workspace Windows ini, bukan diagnosis universal semua Turbopack. Build produksi tidak diubah.
- `npm.cmd run test:dev`: PASS sebelum dan sesudah build final. Setelah cold startup settle: 0 navigasi/restart selama idle 12 detik, readyState complete, tidak ada UI aria-busy tertinggal, menu/navigasi/validasi form berfungsi dan tidak ada page runtime error. Tidak memanggil provider/menulis DB. Perintah ini menguji dev server yang sudah berjalan dan tidak menghentikannya.
- `npm.cmd run verify`: PASS lint/typecheck/103 tests/build. Body respons health/Home selesai penuh HTTP 200. Server Webpack tetap aktif di `http://127.0.0.1:43001`; port 3000 diblokir Windows EACCES. Docker hanya menampilkan port internal 3000 Studio/REST, tidak ada listener host web pada 3000. Container/proyek Docker lain, akun dan environment tidak diubah.

### QA-01 lokal — 31 Oktober 2026

- `npm.cmd run lint` dan `npm.cmd run typecheck`: PASS; `npm.cmd test`: 103/103 PASS; `npm.cmd run build`: PASS. Instalasi dev tools Playwright/axe berhasil, audit seluruh dependency saat install 0; `npm.cmd audit --omit=dev` juga 0 vulnerabilities. Tidak meng-upgrade stack atau memberi izin lifecycle tambahan.
- `npm.cmd run test:browser`: PASS pada Chromium 156.0.8078.4, server produksi loopback dan Supabase lokal. Skrip juga menjalankan test:local dan smoke: PASS. Tambahan HTTP login JSONP 415, body >4096 byte 413 dan UTF-8 rusak 400; bounded reader unit mencakup deadline. Auth/RLS/CSRF/cookie/CRUD/publish/retract/konflik/pagination/projection/cache/429 regresi tetap lulus.
- Browser/axe: Home/check/reports/login pada 360/390/768/1280/1440 tanpa pelanggaran WCAG A/AA yang dideteksi axe dan tanpa horizontal overflow. Antrean/editor admin serta daftar/detail published fixture diperiksa mobile/desktop. Review screenshot Home desktop/mobile serta daftar/detail dilakukan langsung; tidak mengklaim perbandingan Figma.
- Interaksi: skip link/keyboard/menu, reduced motion (komet hilang, heading tanpa animasi), empty/invalid input tanpa request, focus error, pending disabled, error 503 fixture, hasil cached dari RPC DB nyata, sumber kosong jujur dan draft publik 404: PASS. Tidak ada provider live yang dipanggil ulang pada QA ini.
- Admin: login/password toggle, create/edit/sumber/catatan privat, tombol publish terkunci sebelum approval, publish dan detail publik, filter/search, cancel/accept konfirmasi retract/arsip, restore dan logout: PASS. Payload `<img ... onerror>` tampil literal, tidak mengeksekusi JavaScript; catatan privat tidak tampil. Header nosniff/frame/CSP terbatas lulus; tidak ada page runtime error.
- Temuan awal: opacity judul saat animasi memicu kontras rendah, diperbaiki menjadi gerak tanpa fade dan diuji ulang lulus. Dua kegagalan lain berasal dari selector tes (Next route announcer juga role alert; tombol logout berada di dashboard), diperbaiki tanpa mengubah alur produk. Run final lengkap lulus.
- Bukti lokal: `artifacts/qa/results.json` dan screenshot Home/check/daftar/detail berlabel fixture, diabaikan Git. Fixture akun/laporan/namespace itest_browser_ dibersihkan, server milik tes dihentikan; admin/data pengguna serta Docker/Supabase tetap dipertahankan.
- Penutupan: `npm.cmd run verify` PASS berurutan (lint/typecheck/103 tests/build) pada perubahan akhir. Scan 17 aset client build final dan 145 file kandidat repository tidak menemukan empat secret backend/provider/hash yang terkonfigurasi; nilai tidak dicetak. `.env.local`/artifacts ignored, hanya `.env.example` tracked. SQL read-only memastikan fixture_users/reports/jobs/counters masing-masing 0. Diff check lulus dengan aturan CRLF Windows; tidak commit/push/deploy.
- Batas: QA-01 DONE **lokal**, bukan sertifikasi aksesibilitas, factual accuracy, T06 semantik nyata, seluruh browser, expiry sesi jangka panjang, load test produksi, strict script CSP atau izin public launch. Model membantu review dan final otomatis tetap unverified/draft. Gate HTTPS/proxy/DNS/TLS pada hosting, retensi produksi, terms/kuota dan rollback deployment tetap RELEASE-01; panduan [QA/rilis](20_LOCAL_QA_RELEASE.md).

### INT-01 — 31 Oktober 2026

- Lint/typecheck/build: PASS; npm.cmd test: 103/103 PASS. Tambahan 14 subtest/test termasuk RPC backend-only, lease/limit/cache/rollback/budget, controller service/no-provider pada cache/deny, URL context/truncation, browser response contract dan JSON byte/deadline.
- Supabase lokal semula tidak aktif (ECONNREFUSED 54322). Docker Desktop dinyalakan, supabase start dari data lama berhasil; migration up --local menerapkan 0005 tanpa reset. setup:local-check menambahkan backend key/hash secret dan flag teks; --enable-url diaktifkan setelah gate unit/HTTP/rate/cap/TLS lulus. Nilai key/model provider tidak diganti; cloud/billing tidak disentuh.
- Acceptance pada namespace itest_ dan port loopback tersedia: test:local PASS pada build akhir; service-only RPC/dua reserve concurrent -> reserved+processing; completed preview fixture -> HTTP cached/parse contract/draft 404/satu report; request keenam -> 429 dengan Retry-After; extra-field 400/body cap 413; regresi Auth/PostgREST/BE-03/FE-02 juga PASS. Run awal flag URL false -> 422. Windows port 3100 EACCES diatasi port sementara, bukan perubahan app/DB.
- test:check-live (opt-in, teks): PASS, 3 kandidat, analysisAvailable true, unverified/draft tersimpan, replay cache dan draft publik 404. Maksimum 2 generasi Gemini + 1 pencarian Fact Check, tanpa URL/Grounding/publish. Draft/namespace dibersihkan.
- Probe transport HTTPS example.com: PASS 200/text-html/156 karakter, contextVerified false. test:check-live -- --url pada server URL aktif: PASS, loopback/metadata IP 422 fetch_blocked; example.com mencapai ekstraksi lalu no_factual_claim/422 tanpa report. Maksimum 2 generasi + 1 pencarian; pada outcome ini alur berhenti sebelum pencarian. Domain contoh bukan ground truth berita. Namespace probe dibersihkan.
- Smoke final PASS tanpa kiriman valid/provider call. Scan Gemini/Fact Check/backend Supabase/hash secret pada .next/static tidak ditemukan; .env.local ignored dan tidak tracked. Test/fixture/probe semua dibersihkan; akun admin pengguna dipertahankan.
- Belum lulus berdasarkan sesi ini: visual/interaksi browser, kapasitas/proxy/header/transport deployment, penilaian factual accuracy. Fallback unverified tidak menjadi bukti semantic entailment. Panduan: docs/19_CHECK_INTEGRATION.md.

### FE-02 — 30 Oktober 2026

- `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test` (89/89) dan `npm.cmd run build`: PASS. Unit baru mencakup input/projection injection, escaping search literal, query SDK, pagination, source URL, error layanan, missing/private ID dan fallback 416 dengan count terfilter.
- `npm.cmd run test:local`: PASS pada build akhir. Public API/SSR detail/Home membaca published, menyembunyikan draft meski request memakai cookie admin, tidak membocorkan catatan privat/audit/ID penerbit. Search/filter/pagination 13 fixture -> 12+1 tanpa duplikasi; page melewati hasil dan filter kosong -> 200/empty/count benar. Retraction langsung mengembalikan 404 pada request baru. Regresi CRUD/auth/RLS/CSRF/optimistic concurrency tetap lulus. Semua fixture akun/laporan dibersihkan.
- `$env:CEKFAKTA_BASE_URL='http://127.0.0.1:3100'; npm.cmd run smoke`: PASS. /check tetap validation-only. Scan nilai key Gemini/Fact Check dalam .next/static: tidak ditemukan.
- Temuan awal diperbaiki: loading bersama menyebabkan detail not-found status 200; pagination kosong PostgREST 416 sempat menjadi 503. Acceptance diulang dan keduanya lulus. Tidak ada request model/provider live, migrasi/reset database, perubahan env atau deploy.
- Review visual/interaksi browser belum diuji; HTML SSR dan status HTTP tidak dianggap bukti layout mobile/keyboard sudah lulus. Detail penggunaan dan kontrak publik: docs/18_PUBLIC_REPORTS.md.

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
