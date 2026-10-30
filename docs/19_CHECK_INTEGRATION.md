# Integrasi pemeriksaan publik — INT-01

Status lokal: DONE, 31 Oktober 2026. Form Home dan `/check` terhubung ke ekstraksi klaim, Google Fact Check, analisis metadata Gemini serta penyimpanan draft. Hasil otomatis selalu **unverified/draft**; publikasi dan keputusan valid/hoaks tetap tugas admin. Bukti metadata dan kecocokan tekstual bukan pembuktian fakta.

## Menjalankan kembali

Docker/Supabase lokal sudah dinyalakan pada sesi implementasi, migrasi 0005 sudah terpasang tanpa reset. Helper setup telah menambahkan key backend Supabase dan CHECK_HASH_SECRET acak ke `.env.local`, serta mengaktifkan PUBLIC_CHECK_ENABLED, GEMINI_ANALYSIS_ENABLED, FACTCHECK_SEARCH_ENABLED dan PUBLIC_URL_CHECK_ENABLED untuk lokal. Key/model Gemini dan key Fact Check tidak diganti; billing/cloud tidak disentuh. Akun admin lama dipertahankan.

Setiap sesi baru cukup nyalakan Docker Desktop, `npx.cmd supabase start`, lalu `npm.cmd run dev`. Jika dev server sudah berjalan sebelum perubahan environment, restart agar konfigurasi baru terbaca. Buka alamat yang ditampilkan terminal. Tidak perlu membuat ulang akun admin atau mengisi key lagi.

Untuk instalasi lokal baru yang env/provider-nya sudah terisi: terapkan migrasi lokal yang sudah ditinjau, lalu `npm.cmd run setup:local-check`. Script hanya menerima URL loopback yang sama dengan Supabase CLI dan tidak mencetak key. Secara default script tidak mengaktifkan URL baru. Sesudah gate SSRF/transport/rate-limit/content cap diverifikasi, operator dapat menjalankan `npm.cmd run setup:local-check -- --enable-url` untuk lokal. Jangan menerapkan setup lokal ke Supabase cloud.

## Alur dan hasil

1. Pengguna memilih teks 20–5000 karakter atau URL HTTP/HTTPS publik, lalu salah satu dari tiga kategori. Payload hanya inputType/input/category.
2. Server membatasi JSON sampai 22000 byte dan pembacaan 5 detik. Input/URL yang tidak valid ditolak sebelum pemanggilan provider.
3. Worker server-only meminta slot kerja ke RPC PostgreSQL. Masukan identik menggunakan cache bersama selama 5 menit; pekerjaan yang masih berjalan mengembalikan 409/Retry-After, bukan pekerjaan paralel kedua. Ini request sinkron, bukan antrean background atau status progres berdasarkan timer.
4. Untuk URL aktif, klien DATA-02 memeriksa IP/DNS dan setiap redirect, melakukan pinning koneksi serta membatasi MIME/byte/timeout. Hanya teks yang diekstrak; tidak menjalankan script atau mengambil gambar. URL submit disimpan tanpa query/fragment untuk menghindari token pelacakan/akses. Tanggal/judul asli artikel belum menjadi bukti faktual. Batas/truncation dicatat dalam hasil awal dan catatan privat admin.
5. Gemini mengekstrak satu klaim verbatim, Fact Check mencari kandidat metadata, lalu Gemini membantu analisis metadata jika ada kandidat. Pencarian sukses tanpa kandidat melewati analisis model dan menghasilkan draft unverified; ekstraksi model sebelumnya tetap digunakan. No factual claim -> 422 tanpa laporan. Kegagalan provider/model bukan hasil kosong dan tidak menghasilkan verdict palsu.
6. Complete RPC memeriksa token/masa lease lalu menyimpan report, catatan privat, provenance kandidat dan preview awal dalam satu transaksi. Kegagalan membatalkan seluruh batch. Report baru selalu unverified/draft, tidak pernah mengedit report published.
7. Form menampilkan klaim, sumber/tanggal ulasan, keterbatasan dan status menunggu admin. Draft tidak bisa dibuka lewat API laporan publik. Setelah approval admin, laporan muncul sesuai FE-02.

Draft bantuan analisis di `/admin/new` memakai service dan budget yang sama setelah auth/Origin dicek; responsnya ID report. Manual CRUD/approval admin tetap memakai JWT user/RLS dan tidak memerlukan key worker. Kill switch PUBLIC_CHECK_ENABLED menghentikan kedua entry point analisis, tanpa mematikan laporan published atau CRUD manual.

## Kontrak POST /api/check

200 berisi `{mode:"analysis",id,claim,category,verdict:"unverified",reviewStatus:"draft",analysisAvailable,cached,summary,reason,limitations,sources,notice}`. Sumber preview `{url,title,publisher,publishedAt:null,reviewedAt:null|ISO}`: tanggal ulasan tidak dipalsukan menjadi tanggal terbit. Preview cache adalah hasil awal yang sama, bukan isi catatan atau suntingan admin terbaru. Cache hanya dipakai jika report masih draft dan versinya belum berubah.

- 400: payload/JSON/input salah; 413: body terlalu besar; 415: MIME bukan JSON.
- 409 processing: kiriman identik masih berjalan, Retry-After 3 detik.
- 422: URL dinonaktifkan/diblokir, artikel tak dapat diproses, atau tidak ada klaim faktual.
- 429: batas subject, concurrency atau budget aplikasi tercapai; Retry-After disertakan.
- 503: konfigurasi/provider/database/analisis tidak tersedia. Jika koneksi putus sesudah commit, coba kembali dengan input sama agar cache mengembalikan ID draft yang sudah tersimpan. Tidak ada retry provider otomatis.

Semua respons check no-store. Health kini `{ok:true,service:"cekfakta",mode:"integrated"}`; itu liveness aplikasi, bukan jaminan provider/quota siap.

## Penyimpanan bersama dan batas aplikasi

Migrasi 0005 menambah tabel private.check_jobs/check_counters dengan RLS, tanpa grant baca ke anon/authenticated/service_role. Hanya RPC reserve_check/complete_check/fail_check berhak execute service_role, SECURITY DEFINER dengan search_path kosong dan payload terbatas. Model/user tidak dapat memanggil RPC atau memilih namespace/token. Worker memakai SUPABASE_SERVICE_ROLE_KEY atau SUPABASE_SECRET_KEY server-only, bukan key client dan bukan JWT admin.

Reserve memakai advisory lock per namespace dan lease UUID 90 detik. Token lama tidak boleh menyelesaikan atau membatalkan kerja baru. Cache invalid jika report dihapus, diubah, dipublikasikan atau masa simpan berakhir. Penyimpanan draft atomik juga mencakup cache, sehingga replay tidak menggandakan report. Cleanup cache/counter kadaluwarsa dilakukan oportunistik dan dibatasi; draft tidak ikut dihapus otomatis. Retensi draft dan operasi rutin tetap perlu ditinjau sebelum rilis.

Ceiling aplikasi (fixed window, bukan jatah gratis provider):

| Batas | Nilai |
|---|---|
| Semua permintaan valid | 120/menit per namespace |
| Subject (termasuk cache/processing) | 5 per window 10 menit |
| Pekerjaan aktif | 3, lease 90 detik |
| Pekerjaan baru | 10/menit dan 20/hari UTC |
| Reservasi generasi Gemini | 20/menit dan 40/hari UTC (2 per pekerjaan) |
| Reservasi pencarian Fact Check | 20/hari UTC (1 per pekerjaan) |
| Reservasi URL | 20/hari UTC |

Reservasi worst-case tidak dikembalikan bila proses gagal atau analisis kedua dilewati, karena kegagalan provider dapat tetap mengonsumsi kuota. Google console pengguna sebelumnya menampilkan 300 request Fact Check/menit; itu tidak berarti batas harian/biaya diketahui. Tidak mengaktifkan Grounding/billing.

Request key adalah HMAC masukan+jenis+kategori+model+versi policy. Subject HMAC berotasi per hari; IP mentah/input lengkap tidak masuk tabel counter/cache key. CHECK_HASH_SECRET harus stabil lintas instance dan minimal 32 karakter. Cache preview menyimpan klaim hasil ekstraksi/referensi minimum, bukan body artikel, raw output model atau credential. Masukan berbeda yang menghasilkan klaim sama masih dapat memakai pekerjaan terpisah; cache metadata provider mandiri masih per proses, sementara cache seluruh hasil pemeriksaan sudah lintas proses via DB.

Tanpa CHECK_TRUSTED_IP_HEADER, klien tidak dikenal berbagi satu bucket konservatif; X-Forwarded-For tidak dipercaya otomatis. Isi header itu hanya jika reverse proxy yang dikelola operator benar-benar menghapus/mengganti header dari klien dengan IP terverifikasi. Header harus berisi satu IP valid, selain itu kembali ke bucket bersama. Jangan mengubah namespace produksi untuk mereset budget. Staging/deployment perlu memverifikasi header proxy, kapasitas, timeout dan transport socket/TLS aktual sebelum rilis.

## Hasil pengujian sesi

- Lint/typecheck/build PASS, 103/103 unit/SQL PASS. Unit menguji invalid input, fail-closed, source/citation/response guard, URL policy, deadline/body cap; SQL menguji izin RPC, cache/lease/limit, forged verdict, rollback provenance, stale-token serta budget bersama.
- Acceptance Auth/PostgREST/HTTP lokal PASS dengan namespace itest_ terisolasi: dua reserve concurrent -> reserved/processing; preview fixture tersimpan satu kali dan replay HTTP cached; request keenam -> 429/Retry-After; draft publik 404; body cap dan regresi BE-03/FE-02 lulus. Flag URL false juga diuji 422 pada run awal. Tidak ada provider pada acceptance fixture. Semua fixture dibersihkan.
- Probe teks nyata PASS: 3 kandidat referensi, analysisAvailable true, draft benar-benar tersimpan unverified/draft, replay cached dan public read 404. Maksimal 2 generasi + 1 pencarian; bukan bukti bahwa klaim probe benar/salah. Draft serta namespace probe dibersihkan.
- Satu probe transport HTTPS example.com PASS (200, text/html, 156 karakter, contextVerified false). Probe URL HTTP terintegrasi juga PASS: loopback/metadata IP ditolak, example.com mencapai ekstraksi lalu no_factual_claim/422 tanpa draft. Maksimal 2 generasi + 1 pencarian per probe URL; hasil ini berhenti di ekstraksi. Domain contoh bukan berita nyata/ground truth.
- Smoke tanpa kiriman valid PASS; key Gemini/Fact Check/backend Supabase serta hash secret tidak ditemukan di bundle client. .env.local diabaikan Git dan hanya .env.example yang terlacak.
- Kendala lokal teratasi: Docker semula mati, dinyalakan tanpa reset; Windows menolak bind 3100 (EACCES), acceptance memakai port loopback tersedia. Tidak mengubah port dev server pengguna, cloud, billing atau password/admin.

Pembaruan QA-01: visual/interaksi Chromium lokal serta review screenshot sudah lulus, termasuk form/cache/error dan alur editorial. Lihat [test plan](09_TEST_PLAN.md) dan [panduan lokal/rilis](20_LOCAL_QA_RELEASE.md). Deployment publik, sifat aman header proxy di hosting tujuan serta factual accuracy/semantic entailment belum dinyatakan lulus. Jangan menandai rilis/Figma atau kebenaran model selesai hanya dari hasil integrasi lokal.
