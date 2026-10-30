# Changelog

## DATA-05 — perbaikan pilihan kutipan pada input pengguna
- Dua request pengguna masih gagal invalid_quote. Ubah schema rentang ID kalimat global menjadi varian per sumber dan enum kalimat quotable milik sumber itu; dokumen tanpa kalimat layak hanya boleh unclear/null. Guard backend tidak dilonggarkan.
- Tambah regresi schema sumber/navigasi/kalimat tak layak serta contoh input di docs/22. Uji langsung web pengguna PASS HTTP 200, 3 sumber/3 quote/unverified/draft; replay formulir mobile cache ID sama/3 quote/tanpa overflow PASS. Draft nyata disimpan untuk admin, tidak publish. Status checks final di TASKS.md.
- Verify akhir PASS lint/typecheck/117 unit+SQL/build; server Webpack direstart setelah build pada 43001. Tidak mengubah billing/key/budget/admin/cloud. Teks gagal pengguna belum diberikan, tidak mengklaim reproduksi persis input tersebut.

## DATA-04 — pencarian Tavily dan kutipan sumber
- Pengguna memilih Tavily dan menyediakan key lokal. Tambah adapter Search/Extract basic endpoint tetap, bounded body/deadline, maksimal 3 sumber dan safe-fetch DATA-02; metadata tidak disamarkan sebagai isi artikel. Gemini membuat query dengan tahun asli, lalu membandingkan kalimat sumber.
- Schema wajib satu comparison per dokumen; model memilih ID kalimat asli, server mengambil quote dan memvalidasi span/hash/keunikan. Kegagalan JSON/quote tetap ditolak; diagnosis log hanya label tetap. Semua hasil unverified/draft, publish tetap admin.
- Migrasi lokal 0006/0007 menambah provenance/constraint/cache preview/RPC reservasi web service-only per lease; 2 kredit/check dan 20 kredit/hari. Tidak reset data/admin. Cache policy web baru tanpa reset bucket subject/global.
- UI publik/admin/detail menampilkan jenis sumber, quote dan tanggal yang benar-benar tersedia. Tambah setup flag lokal, acceptance live/cache/browser dan docs/21–22 untuk harga/terms/batas. Tidak menyalin artikel penuh ke DB atau mengaktifkan Grounding/PAYG/billing/deploy.
- Verify PASS 116 tests; test:web-live final PASS 3 sumber/3 quote/draft/cache/404/mobile/axe dan cleanup. Bukti/regresi/aktivasi akhir di TASKS.md/docs/09; tidak mengklaim verdict PISA atau semua sumber primer.

## Riwayat awal DATA-04 — riset perluasan pencarian dan biaya
- Catat harga resmi token Gemini/Search Grounding/billing serta alternatif retrieval Tavily di docs/21, termasuk perhitungan nominal per 1.000/sejuta pemeriksaan dengan asumsi token eksplisit.
- Probe Grounding yang diizinkan pengguna ditolak 429 kuota/free tier. Pembacaan terms lengkap mengoreksi saran awal: Grounding tidak disambungkan sebagai crawler/cache/database report publik. Pengguna diminta menunda aktivasi billing dan memilih alternatif retrieval.
- DATA-04 tetap IN_PROGRESS menunggu pilihan provider/credential; belum mengubah pipeline/DB/env atau mengaktifkan paid plan. Tidak mengklaim fitur web search selesai, mengubah data pengguna, commit/push atau deploy.

## DEV-01 — perbaikan loading/refresh development
- Reproduksi loop HMR Turbopack di Windows: 36 navigasi browser/12 detik tanpa perubahan source. Default dev menggunakan Webpack; stack dan production build tetap sama.
- Tambah test:dev untuk stabilitas idle, runtime dan interaksi browser. PASS sebelum/sesudah build: 0 reload/restart selama idle 12 detik. verify lint/typecheck/103 tests/build PASS. Dokumen membedakan port internal Docker 3000 dari web host 43001 dan menjelaskan mengapa QA production sebelumnya tidak menangkap bug dev.
- Server dev diperbaiki dan dibiarkan aktif pada 43001. Tidak mengubah container/data/admin/key, memanggil provider, commit/push atau deploy.

## 31 Oktober 2026 — QA-01 dan FE-01 selesai lokal
- Tambah acceptance Playwright Chromium/axe, lima viewport, keyboard/menu/reduced motion, form invalid/loading/error/cache dan admin editorial/pencarian/detail/escaping/konfirmasi/logout; otomatis menjalankan regresi HTTP/Auth/RLS/cache dan smoke. Fixture lokal sementara dan server tes dibersihkan; screenshot di artifacts/qa diabaikan Git dan di-review langsung.
- Perbaiki kontras heading selama animasi dengan gerak tanpa fade; tambah konfirmasi arsip/retract, login bounded UTF-8 4 KB/5 detik, deadline UI auth dan header keamanan/CSP terbatas tanpa klaim strict script policy.
- Siapkan npm verify dan task IDE Windows, perbarui dokumentasi scaffold ke status terintegrasi, demo dan prosedur/gate rilis/rollback/retensi di docs/20. Playwright/axe hanya dev dependencies, tidak mengganti stack.
- Lint/typecheck/build/103 tests/test:local/smoke/test:browser PASS, audit dependency runtime 0 vulnerabilities; tanpa panggilan provider baru/cloud/deploy/reset/commit/push. FE-01/QA-01 DONE lokal; RELEASE-01 baru persiapan dokumen lokal, staging/retensi produksi/header proxy/transport hosting belum diuji.

## 31 Oktober 2026 — INT-01 dan DATA-03 selesai lokal
- Hubungkan form Home/check dan admin analyze ke ekstraksi Gemini, Fact Check metadata, analisis dan draft unverified atomik. Hasil/sumber/batasan/pending/error/cache ditampilkan dengan kontrak tervalidasi; tidak ada mock atau auto-publish.
- Migrasi 0005: private shared counters/jobs, RPC service-only untuk budget/rate/concurrency/lease/cache; HMAC input/subject, token lease stale-safe, report version invalidation dan commit report/notes/provenance/preview atomik. Worker credential server-only; admin CRUD/publish tetap JWT user/RLS.
- Tambahkan setup lokal (CLI key backend/hash secret, aktivasi flag tanpa mengganti key/model provider), opt-in live probe teks/URL, 14 tes tambahan (103 total), perluas acceptance HTTP shared cache/429. Docker awalnya mati dinyalakan kembali, migrasi lokal tanpa reset; URL lokal diaktifkan setelah guard/cap/rate/TLS teruji. Cloud/billing tidak diubah.
- Lint/typecheck/build/103 tests/test:local/smoke lulus. Live teks: 3 kandidat, analisis/draft tersimpan, replay cached, draft publik 404; URL: private IP ditolak, example.com mencapai ekstraksi lalu no_factual_claim tanpa draft. Fixture/probe dibersihkan. Key backend/provider/hash secret tidak ada di bundle client, env tetap ignored.
- Smoke tidak mengirim valid input/provider request; health mode integrated. Review visual/browser, header proxy dan transport deployment serta factual accuracy tetap belum dinyatakan lulus; berikutnya QA-01.

## 30 Oktober 2026 — FE-02 laporan publik dari Supabase
- Hubungkan daftar/detail laporan dan tiga laporan terbaru Home ke Supabase anon; tambah GET /api/reports dan /api/reports/[id] dengan projection publik/published-only. Sesi admin tidak ikut digunakan pada pembacaan publik.
- Implementasikan pencarian literal klaim, filter kategori/verdict, pagination 12 dengan tiebreaker ID, sumber/tanggal, label verdict/editorial, loading/empty/error/404 yang jujur. Data baru setelah retraction tidak disajikan dari cache publik.
- Perbaiki status detail not-found 200 akibat loading bersama dan penanganan range kosong PostgREST 416. Tambah 7 unit test dan perluas acceptance lokal untuk public API/SSR/Home, privasi saat cookie admin, publication/retraction, search/filter/pagination 12+1/range kosong.
- Lint/typecheck/build, 89 tests, acceptance Auth/PostgREST/HTTP dan smoke lulus; fixture dibersihkan; key provider tidak ditemukan dalam bundle client. Tidak memanggil provider live, memigrasi DB, mengubah env atau deploy. Review visual browser belum diuji. /check masih validation-only; berikutnya INT-01.

## 24 Oktober 2026 — BE-03 pengelolaan laporan admin
- Implementasikan antrean/detail/editor admin, sumber editorial, catatan privat, persetujuan publikasi, tarik ke draft, arsip (soft delete rejected) dan restore; audit ditampilkan dari database. Form memiliki pending/error/empty state dan konflik versi; laporan published tidak dapat diedit sebelum ditarik.
- Tambahkan RPC SECURITY INVOKER save_report_draft/admin_report_action pada migrasi 0004. Report/catatan/sumber/provenance tersimpan atomik; optimistic version dan row lock mencegah saling timpa. Migrasi diterapkan lokal tanpa reset/cloud.
- Tambahkan endpoint admin analisis teks ke draft, sink final unverified/draft dan provenance; usulan verdict model tidak menjadi keputusan final. Pipeline kini menyertakan sources hasil retrieval. Endpoint publik tetap validation-only; tidak memanggil provider baru atau mengubah environment.
- Lint/typecheck/build lulus; 82/82 unit/SQL lulus; acceptance HTTP Auth/PostgREST/CRUD/concurrent edit/approval/retract/arsip/restore lulus dan fixture dibersihkan; smoke lulus; key provider tidak ditemukan di bundle client. Review visual/browser dan endpoint analisis live belum diuji.
- Pengguna melaporkan kuota Fact Check 300 request/menit; tidak menyimpulkan batas harian/biaya. Berikutnya FE-02, lalu integrasi publik serta shared budget/rate limit INT-01.

## 24 Oktober 2026 — Validasi provider live DATA-03
- Tambahkan probe opt-in `npm.cmd run test:factcheck`: maksimal satu request, tanpa retry, tanpa respons mentah atau key dalam output, tanpa Gemini/artikel/database writes.
- Provider HTTP 200 menghasilkan 5 kandidat nyata; normalisasi, payload provenance dan cache replay lulus. Berhasil mencari metadata tidak berarti klaim sudah diverifikasi atau berita sudah tersimpan.
- Lint/typecheck/build dan 72/72 unit/SQL lulus; nilai key Fact Check tidak ditemukan pada bundle client. DATA-03 tetap IN_PROGRESS: kuota proyek belum dikonfirmasi; shared budget dan aktivasi publik tetap gate INT-01. Environment pengguna dan billing tidak diubah.

## 24 Oktober 2026 — AI-01 selesai sebagai modul server
- Gemini 3.5 Flash-Lite berhasil menjalankan live acceptance: ekstraksi dan analisis metadata (2 request), lalu probe lengkap dengan full-text comparison (3 request). Semua data fiktif untuk uji, tidak tersimpan di DB atau tampil sebagai berita nyata.
- Tambahkan perbandingan isi sumber dengan ID allowlist, quote literal/kalimat utuh, span/hash dan label konteks untrusted. Pipeline optional full-text gagal tertutup pada citation invalid; semua final otomatis tetap unverified/draft sampai review admin.
- 8 test tambahan, total 72/72 lulus; lint/typecheck/build lulus dan key tidak ditemukan di bundle client. Template model diperbarui ke gemini-3.5-flash-lite; environment pengguna/aktivasi/billing tidak diubah.
- AI-01 DONE untuk modul; DATA-03 provider live, BE-03 report save/CRUD/approval, dan INT-01 integrasi/rate-limit tetap terpisah. Tidak ada API publik baru atau report pengguna tersimpan.

## 24 Oktober 2026 — Lanjutan ekstraksi/pipeline AI-01
- Tambahkan ekstraksi kandidat klaim verbatim dengan kalimat utuh, hash/span server dan konteks literal/null; tidak mengklaim factuality terverifikasi.
- Tambahkan flags mekanis tahun/negasi/entitas/lokasi, pipeline internal extraction/search/analysis dan entry point admin dengan preflight akses/provider. Tanpa database writes atau API publik.
- Tambahkan 9 test, total 64/64 unit/SQL lulus; perjelas kode error model 400/401/403/404/429.
- Tambahkan probe metadata dan live opt-in. Metadata dapat dibaca, tetapi dua probe ekstraksi fiktif masing-masing gagal HTTP 404. Tidak ada live generation berhasil, model fallback, perubahan environment/billing atau data report. AI-01 tetap IN_PROGRESS.

## 24 Oktober 2026 — AI-01, modul Gemini terisolasi
- Tambahkan SDK resmi Gemini, server-only env boundary dan flag analisis default false. Model harus dikonfigurasi eksplisit; tidak ada fallback atau live call.
- JSON schema + validasi ketat, allowlist ID, penolakan claim drift/auto-publish/extra fields/URL karangan, pembatasan ukuran/token/deadline dan error netral.
- Metadata-only selalu menghasilkan final unverified dengan penjelasan netral server. Usulan model terpisah/untrusted. Pencarian kosong tidak memanggil model; provider error bukan hasil pencarian kosong.
- Tambahkan 9 test; total 55/55 lulus setelah memperbaiki duplicate variable yang ditemukan test. AI-01 tetap IN_PROGRESS: model live, bukti lengkap, ekstraksi klaim dan contextual entailment belum tersedia. Formulir publik tetap validation-only.
- Pemeriksaan akhir lint/typecheck/build lulus; nilai key Gemini tidak ditemukan pada bundle client hasil build.

## 24 Oktober 2026 — Persistensi sumber DATA-03
- Tambahkan migrasi additive 0003: provenance kandidat report_sources, constraint metadata, unique key per laporan dan RPC batch SECURITY INVOKER yang mengikuti RLS/guard/audit.
- Repository memvalidasi ulang kandidat, mempertahankan tanggal klaim/ulasan/retrieval secara terpisah, tidak menyimpulkan verdict. Deduplikasi juga membedakan claimant.
- Orkestrasi server internal memeriksa admin/draft sebelum pencarian; tidak ada endpoint publik, pembuatan laporan atau auto-publish.
- Lint/typecheck/build dan 46 unit/SQL tests lulus. Migrasi diterapkan lokal tanpa reset; integrasi Data API lulus untuk concurrent dedupe, rollback, provenance dan akses lintas peran. Fixture dibersihkan; smoke lulus.
- DATA-03 tetap IN_PROGRESS: key Fact Check belum tersedia, pencarian live nonaktif, shared cache/budget belum tersedia. Tidak mengubah .env.local, cloud atau memanggil Gemini.

## 24 Oktober 2026 — DATA-02, klien artikel internal
- Tambahkan kebijakan IP konservatif, validasi URL, DNS seluruh jawaban dan pinning koneksi, redirect manual/revalidation, batas header/body/waktu, penolakan compression/MIME/charset tidak didukung.
- Tambahkan ekstraksi teks parse5 tanpa browser/script/network: title, tanggal eksplisit, URL akhir, waktu pengambilan, teks terpotong terlabel. Tidak mengklaim ekstraksi klaim faktual atau verdict.
- Review memperketat encoded authority serta batas byte parser. Tambahkan 12 test fixture DNS/transport/stream/parser; total 41/41 lulus, lint/typecheck/build lulus; npm audit instalasi 0 vulnerabilities.
- Dokumentasikan batas pengujian: tidak ada socket/TLS atau fetch live, tidak ada public URL ingestion. Rate limit/review sebelum launch tetap wajib. Berikutnya penyelesaian DATA-03 dan AI-01.

## 24 Oktober 2026 — Riset sumber dan adapter kandidat bukti
- Dokumentasikan kontrak/terms resmi Google Claim Search, jalur akses MAFINDO, batas hak konten dan kebutuhan pemeriksaan kuota/biaya. Tidak mengklaim kuota gratis atau sampel live.
- Tambahkan adapter server Google Claim Search: endpoint tetap, API key header, timeout 8 detik, JSON/content cap, redirect ditolak, provenance, dedupe, bounded cache/in-flight per proses dan error netral.
- Metadata mempertahankan klaim/tanggal/rating asli tanpa verdict atau asumsi relevansi. Query dengan negasi/tahun berbeda tidak digabung; tanggal hilang tetap null.
- Tujuh test kontrak fiktif baru; total 29/29 lulus; lint/typecheck/build lulus. Perbaiki deklarasi opsi JS/TS yang ditemukan typecheck.
- Aktivasi provider default false; belum ada live request, public route, fetch artikel, persistensi sumber atau Gemini. DATA-01 riset selesai; DATA-03 parsial. Berikutnya DATA-02.

## 24 Oktober 2026 — Supabase lokal dan autentikasi admin
- BE-01 diverifikasi pada Supabase lokal aktual (GoTrue + PostgREST), migrasi 0001/0002 terpasang.
- BE-02: login/logout Supabase Auth server-side, SSR HttpOnly cookie/proxy refresh, guard getUser + allowlist, dashboard terlindungi, endpoint sesi 401/403/200, Origin check dan batas body login. Tidak ada service role di aplikasi.
- Tambahkan npm run test:local dengan akun/laporan sementara, regression test CSRF/hostname, panduan provisioning admin. Perluas ignore .env* untuk melindungi salinan environment.
- Lint/typecheck/build dan 22/22 test lulus; integrasi Auth/RLS/HTTP dan smoke lulus; Gemini key tidak ditemukan dalam bundle client. Tidak ada panggilan Gemini, CRUD laporan aplikasi, akun admin permanen, deployment, atau migrasi cloud. Review browser dan expiry refresh masih belum diuji.

## 24 Oktober 2026 — BE-01, fondasi database lokal
- Tambahkan migrasi 0002: pindahkan catatan admin ke tabel privat dengan RLS, tentukan grants eksplisit, batasi background worker ke draft, paksa identitas penerbit dari sesi admin dan catat audit lewat trigger privat.
- Wajib tarik published ke draft sebelum mengedit laporan/sumber. Publikasi mensyaratkan ringkasan/alasan/sumber; review kecocokan bukti tetap tanggung jawab pipeline/admin.
- Tambahkan devDependency PGlite dan npm run test:db: migrasi dijalankan sungguhan pada PostgreSQL tersemat, dengan fixture auth SQL khusus test. Uji menemukan dan memperbaiki audit FK saat cascade delete.
- Lint, typecheck, build lulus; 20/20 tests lulus. Supabase dev belum diuji karena Docker daemon tidak aktif, CLI/kredensial belum tersedia. BE-01 tetap IN_PROGRESS, tidak ada perubahan cloud atau login produksi palsu.

## 24 Oktober 2026 — Penyempurnaan gerak hero
- Tambahkan komet cyan, titik bintang statis, dan garis lengkung tipis pada latar hero dengan CSS tanpa dependency atau JavaScript tambahan.
- Tambahkan animasi masuk heading serta efek hover kartu/tombol. Komet selesai dalam 3,7 detik; reduced-motion menonaktifkan animasi; mobile menampilkan dua komet.
- Lint, typecheck, 11/11 unit test dan build produksi lulus setelah revisi. Review visual browser belum tersedia.

## 24 Oktober 2026 — Tahap lokal Home dan Cek Berita
- Terapkan token dark navy/cyan DESIGN.md ke seluruh rute; navigasi mobile, tautan lewati navigasi, dan fokus keyboard.
- Home memiliki formulir nyata bersama /check, topik, alur editorial dan keadaan laporan kosong tanpa angka fiktif.
- Validasi frontend memakai parser server; cegah submit ganda, batasi waktu tunggu, tampilkan error/retry serta hasil validation-only yang eksplisit.
- Tambahkan lockfile hasil instalasi, dua unit test kebijakan input dan smoke HTTP rute/redirect/API.
- Lint, typecheck, 11 unit test, build produksi dan smoke HTTP lulus. Review visual browser belum dijalankan.
- Git lokal diinisialisasi; GitHub, Supabase, Gemini, verifikasi bukti dan admin tetap belum terintegrasi. Tidak ada deployment.

## 0.0.1 — Scaffold starter
- Next.js UI for public home, check form, report empty states and admin login placeholder.
- Input-validation-only `/api/check` returns `unverified`; health route.
- Test fixtures and unit tests for input policy; NO live Gemini or fact checking.
- PRD, validation policy, architecture, DB/RLS migration, workflow, backlog and agent rules.
