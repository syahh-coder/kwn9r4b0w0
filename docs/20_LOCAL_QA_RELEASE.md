# QA lokal dan persiapan rilis

Status resmi setiap task ada di [TASKS.md](../TASKS.md); hasil eksekusi ada di [rencana pengujian](09_TEST_PLAN.md). Panduan ini tidak menjalankan deployment atau mengubah Supabase cloud.

## Menjalankan aplikasi yang sudah disiapkan

1. Nyalakan Docker Desktop dan tunggu engine siap.
2. Dari folder repository, jalankan `npx.cmd supabase start`. Data dan akun lama dipakai kembali; tidak perlu membuat admin setiap mulai.
3. Jalankan `npm.cmd run dev`, lalu buka URL yang dicetak terminal (umumnya `http://localhost:3000`). Restart proses ini setelah mengubah `.env.local`.
4. Login melalui `/admin/login` dengan akun milikmu. Tidak ada password bawaan. Panduan akun: [setup admin](11_ADMIN_SETUP.md).

Jangan menjalankan `supabase db reset` atau menghapus volume Docker untuk sekadar menyalakan website: tindakan itu berbeda dari start/stop dan dapat menghapus data lokal.

Konfigurasi yang diperlukan: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, salah satu `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GOOGLE_FACTCHECK_API_KEY`, `CHECK_HASH_SECRET`, dan flag pada `.env.example`. Key backend/provider/hash tidak boleh memakai awalan `NEXT_PUBLIC_`. Jangan menyalin nilai kunci ke chat atau repository.

`npm.cmd run setup:local-check` tersedia untuk menyiapkan worker **lokal**; jangan dipakai untuk cloud. Detail flag URL dan budget: [integrasi check](19_CHECK_INTEGRATION.md).

## Mengulang pemeriksaan lokal

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
```

Perintah terakhir memerlukan Docker/Supabase lokal, konfigurasi provider yang terisi, dan browser Chromium Playwright. Bila browser belum terpasang di komputer lain, jalankan `npx.cmd playwright install chromium` sekali. Versi Playwright tersimpan di lockfile.

Skrip membuka server produksi sendiri pada port loopback tersedia, menggunakan namespace `itest_browser_` baru, menjalankan acceptance HTTP/Auth/RLS/cache dan smoke, lalu pengujian browser. Akun/laporan fiktif sementara dibuat dan dibersihkan, bukan seed berita. Tidak memanggil Gemini atau Fact Check: hasil UI memakai cache fixture di DB nyata dan error/loading memakai intersepsi jaringan browser khusus tes. `-- --browser-only` melewati acceptance HTTP yang sudah lulus saat menelusuri masalah UI.

Bukti screenshot dan ringkasan terstruktur berada di `artifacts/qa/`, diabaikan Git karena berisi tampilan fixture. Script hanya menghentikan server yang dibuatnya. Docker/Supabase serta akun admin pengguna tetap dipertahankan. Browser/axe membantu pemeriksaan aksesibilitas; ini bukan sertifikasi seluruh kebutuhan pengguna disabilitas atau seluruh browser.

Jika muncul `EACCES` pada port tertentu di Windows, pilih port lain, misalnya `npm.cmd run dev -- --port 43001`; jangan mematikan layanan pengguna secara acak. Script acceptance memilih port tersedia otomatis.

### Loading atau refresh berulang di development

DEV-01 menemukan loop HMR Turbopack pada workspace Windows ini: Chromium mencatat 36 navigasi dalam 12 detik tanpa perubahan source. `npm.cmd run dev` sekarang memakai opsi resmi `next dev --webpack` untuk menghindari loop tersebut. Stack/route dan bundler production build tetap sama. Ini workaround yang dibuktikan pada lingkungan lokal ini, bukan klaim semua instalasi Turbopack bermasalah.

Dengan dev server berjalan, jalankan `npm.cmd run test:dev` untuk menguji 12 detik idle sesudah kompilasi awal, kemudian menu/navigasi/validasi form. Gunakan `CEKFAKTA_BASE_URL` bila port berbeda. Browser dev bisa melakukan refresh awal saat kompilasi, tetapi tidak boleh terus reload saat idle. Tes ini melengkapi `test:browser`, yang sebelumnya hanya menguji production build sehingga tidak menangkap loop development.

Port `3000/tcp` pada daftar Docker adalah port **di dalam container**, bukan otomatis website host di `localhost:3000`. Pada setup lokal ini, Supabase Studio dipetakan `54323 -> 3000`, REST menggunakan port internal 3000 di belakang gateway `54321`, sedangkan Next.js dijalankan lewat npm di port host yang dicetak terminal. Jangan menghentikan container Supabase hanya karena terlihat angka 3000.

## Alur demo lokal

Ikuti [demo](10_DEMO_SCRIPT.md). Pemeriksaan normal memakai provider nyata dan memakan kuota; hasil otomatis tetap `unverified/draft`. Laporan baru tidak muncul di `/reports` sebelum admin menyetujui publikasi. Daftar kosong bukan error bila belum ada laporan published. Referensi kandidat metadata juga belum membuktikan klaim benar atau hoaks.

## Yang memerlukan lingkungan/keputusan rilis

- GitHub Issues/review tim dan Figma UX-01 merupakan deliverable terpisah. Browser lokal dibandingkan terhadap DESIGN.md yang sudah disetujui, bukan diklaim cocok dengan Figma yang belum tersedia.
- Siapkan Supabase cloud **terpisah**; URL `127.0.0.1` dan data/akun Docker tidak ikut pindah bersama kode. Operator meninjau migrasi 0001–0005 sebelum menerapkannya ke project tujuan dan membuat allowlist admin tujuan setelah persetujuan. Agen belum melakukan tindakan cloud ini.
- Siapkan environment pada hosting tujuan. Default publik pada template tetap false. Periksa akses model, terms/izin sumber, kuota dan biaya proyek sendiri; tidak ada Google Search Grounding atau billing yang diaktifkan otomatis.
- Uji staging: cookie Secure/HttpOnly/SameSite pada HTTPS, refresh sesi, RLS lintas peran, Origin/Host, draft 404, publish/retract, budget/cache lintas instance, timeout dan transport socket/TLS/redirect/DNS URL. `/api/health` hanya liveness, bukan bukti provider atau database sehat.
- Tentukan header IP dari proxy yang benar-benar mengganti input klien. Tanpa header terverifikasi, semua klien berbagi bucket konservatif. Jangan sekadar mempercayai `X-Forwarded-For` atau mengubah namespace untuk menghindari budget.
- Aktifkan check teks setelah acceptance staging; aktifkan URL hanya setelah gate transport hosting lulus. Jangan menganggap PASS lokal sebagai persetujuan peluncuran publik.
- Tetapkan penanggung jawab moderasi, retensi/penghapusan, backup dan koreksi laporan. Saat ini draft/editorial/audit **tidak dihapus otomatis**. Cache 5 menit dan expiry counter bukan kebijakan retensi laporan; arsip `rejected` juga bukan penghapusan permanen. Selama dev, gunakan data minimum tanpa rahasia/pribadi; fixture QA dibersihkan setelah tes. Kebijakan retensi produksi harus diputuskan sebelum pengguna publik mengirim data.
- Header CSP lokal membatasi embedding/object/base/form, sedangkan React meng-escape konten. Ini **bukan strict script CSP** berbasis nonce; pembatasan script membutuhkan verifikasi hydration framework di hosting tujuan. Jangan menyebut CSP sebagai jaminan bebas XSS.

## Prosedur rollback yang disiapkan

Jika staging bermasalah, matikan flag `PUBLIC_CHECK_ENABLED` dan `PUBLIC_URL_CHECK_ENABLED` pada lingkungan tujuan, lalu gunakan build sebelumnya yang telah lulus review melalui mekanisme hosting. Check berhenti dengan error layanan yang jujur, bukan hasil palsu. Pertahankan `CHECK_HASH_SECRET` dan namespace agar cache/budget konsisten; jangan mereset penghitung untuk menyiasati kuota.

Migrasi lokal bersifat additive. Jangan membalik skema/menghapus tabel otomatis: gunakan backup, review migrasi perbaikan dan persetujuan operator. Catat build, environment (nama saja), waktu, gejala, hasil smoke sesudah rollback dan orang yang menyetujui. **Deploy dan rollback cloud belum dijalankan**, sehingga RELEASE-01 tidak dinyatakan DONE hanya karena prosedur ini tersedia.
