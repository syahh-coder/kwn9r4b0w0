# Database + RLS design

## Pembaruan DATA-04 — 31 Oktober 2026

Migrasi 0006/0007 lokal menambah hash/span/kutipan web, constraint provider/evidence kind, preview cache dan reserve_web_search service-only dengan token lease. Cadangan 2 kredit/check, maksimum 20/hari/namespace; paling banyak 10 check web baru. Implementasi atomik lama complete_check dipindah private, tidak dapat dipanggil app roles, lalu dibungkus RPC service-only yang menambah preview sumber. RLS/editorial approval/audit tetap berlaku; tidak reset akun/data atau memigrasikan cloud. Skema dan uji: [DATA-04](22_TAVILY_EVIDENCE.md), [test plan](09_TEST_PLAN.md).

## Pembaruan BE-03 — 24 Oktober 2026

Migrasi `0004_admin_reports.sql` sudah diterapkan pada Supabase lokal tanpa reset: `save_report_draft` menyimpan report/catatan/sumber atomik, mempertahankan provenance kandidat saat sumber editorial diganti; `admin_report_action` mengunci baris dan memeriksa versi, transisi serta persetujuan publikasi. Keduanya SECURITY INVOKER, authenticated/admin saja, tidak memberi akses tambahan ke anon/service_role. Trigger guard dan audit lama tetap aktif. Penghapusan aplikasi berupa arsip `rejected`, bisa dikembalikan ke draft. Tidak ada migrasi cloud. Pengujian SQL serta HTTP Auth/PostgREST aktual lulus; detail penggunaan/batas pada [BE-03](15_ADMIN_REPORTS.md).

SQL draft: `supabase/migrations/0001_schema.sql` (review & apply via Supabase migrations **only after** creating a DEV project).

Migrasi lanjutan: `0002_access_hardening.sql`, wajib diterapkan setelah `0001`. Tidak ada script aplikasi yang menjalankan migrasi cloud otomatis.

## Implementasi BE-01 — 24 Oktober 2026

Pembaruan acceptance: Docker/Supabase lokal kini aktif dan migrasi 0001/0002 terpasang. `npm.cmd run test:local` lulus pada GoTrue dan PostgREST aktual, menguji admin/non-admin/anon, isolasi draft/sumber/catatan/audit, publikasi dan retraction, lalu membersihkan fixture. BE-01 selesai untuk dev lokal. Kendala Docker/CLI di bawah adalah catatan sesi awal, bukan kendala terkini. Supabase cloud belum disentuh.

- Catatan editorial dipindahkan dari `reports.admin_notes` ke `report_private.admin_notes`. Alasannya: RLS membatasi baris, sehingga catatan di baris published sebelumnya berpotensi terbaca publik. Migrasi menyalin catatan sebelum menghapus kolom lama.
- Grants eksplisit: publik hanya SELECT laporan/sumber; pengguna terautentikasi tetap harus lolos policy admin untuk menulis; tidak ada DELETE laporan. `service_role` hanya SELECT/INSERT laporan dan sumber untuk draft background (role ini tetap rahasia dan melewati RLS).
- Trigger menolak insert published, menetapkan penerbit ke `auth.uid()` saat publikasi admin, mensyaratkan ringkasan/alasan/sumber, dan memperbarui timestamp. Keberadaan sumber bukan bukti kebenaran: kecocokan bukti tetap wajib diperiksa pipeline serta admin.
- Isi laporan/sumber yang sudah published tidak dapat diedit diam-diam. Tarik ke draft, edit, lalu review dan terbitkan ulang. Penguncian induk sumber mencegah publikasi bersamaan dengan perubahan sumber; uji concurrency pada Supabase tetap diperlukan.
- Audit otomatis untuk perubahan laporan, sumber, dan catatan, tanpa menyalin konten privat ke detail audit. Aplikasi tidak boleh menyisipkan audit sendiri. Fungsi trigger berada di schema private dengan search_path kosong dan akses eksekusi publik dicabut.
- Tidak ada endpoint admin atau login Supabase yang sudah diaktifkan oleh migrasi ini.

## Pengujian lokal tanpa kredensial

Jalankan `npm.cmd run test:db` atau `npm.cmd test`. Test menggunakan PGlite (PostgreSQL tersemat) sebagai devDependency, bukan database aplikasi. Setiap eksekusi membuat database sementara di memori, menerapkan kedua migrasi, menguji grants/RLS/trigger sebagai anon, authenticated non-admin, admin, dan service_role, lalu menutup database.

`auth.users` dan `auth.uid()` di fixture hanyalah kontrak SQL pengujian. Test tidak memvalidasi token JWT, GoTrue, PostgREST, konfigurasi Supabase aktual, atau konkurensi beberapa koneksi. Semua klaim/sumber fixture fiktif hanya ada dalam test dan tidak dirender aplikasi.

## Melanjutkan pada Supabase lokal/dev

1. Siapkan Docker Desktop yang berjalan dan Supabase CLI sesuai dokumentasi resmi. Pada sesi ini `docker info` gagal karena daemon tidak berjalan; CLI belum terpasang.
2. Untuk instance lokal baru: jalankan `supabase init`, periksa config yang dihasilkan, kemudian `supabase start`. Gunakan proyek/port lokal terisolasi; jangan menautkan production.
3. Tinjau migrasi bersama pemilik backend. Terapkan pada instance lokal/dev yang dituju menggunakan workflow migrasi Supabase. `supabase db reset` menghapus database lokal sehingga hanya digunakan pada instance lokal disposable; jangan gunakan `--linked` atau `--db-url` untuk reset cloud.
4. Salin `.env.example` menjadi `.env.local`, isi URL dan anon key dari instance dev. Jangan kirim service role atau password lewat chat/commit. Gemini belum dibutuhkan untuk BE-01.
5. Buat akun admin/non-admin melalui Supabase Auth, provision allowlist dari akses operator tepercaya, lalu ulangi uji melalui Data API: SELECT published saja bagi anon/non-admin; draft/catatan/audit privat; penulisan non-admin ditolak; publish admin memberi identitas yang benar; retraction menghilangkan laporan/sumber dari publik.
6. Tandai BE-01 DONE hanya setelah hasil Supabase dev dan pengujian akses aktual dicatat. Persetujuan manusia diperlukan sebelum migrasi cloud dijalankan.

Referensi: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security), [database testing](https://supabase.com/docs/guides/database/testing), dan [PGlite](https://pglite.dev/docs/about).

## Tables

Pembaruan DATA-03: migrasi `0003_source_provenance.sql` menambahkan provenance kandidat pada report_sources dan RPC `attach_report_candidates` SECURITY INVOKER. Migrasi diterapkan pada Supabase lokal dan diuji lewat Data API, termasuk concurrency/idempotensi/rollback. Detail kontrak dan batas kemampuan: `docs/13_SOURCE_PERSISTENCE.md`. Tidak ada migrasi cloud atau provider live.
- `admin_users`: allowlist of Supabase Auth user IDs; *no public insert permission*.
- `reports`: claim, category, verdict, draft/published/rejected, summary and timestamps.
- `report_sources`: evidence with reference URL, title, excerpt, evidence date, provenance.
- `report_audit`: admin change log (server-only / privileged writes).
- `report_private`: catatan internal admin, tidak dibaca publik meski laporan published.

## Trust boundary
- Public select **only** reports `published` and corresponding sources.
- Users cannot read `draft` or change any report.
- Privileged admin writes must use authenticated user JWT and RLS membership (no hardcoded password).
- Service role bypasses RLS and is not for client; prefer admin auth for CRUD. If service role is needed for background draft creation, keep in server-only and constrain routes & rate limits.
- Audit trail who published and when. Deletion best implemented as retraction/soft delete.

## Manual role provisioning
1. Create auth user from Supabase dashboard/invite (do not enable open admin signup).
2. From secure SQL editor/admin migration, insert their `auth.users.id` into `public.admin_users`.
3. Verify with real user and non-admin accounts that private data remains private.

## Migration checklist
- [ ] Check RLS policies as anon/non-admin/admin.
- [ ] Verify drafts invisible to anon.
- [ ] Verify public published report_sources only.
- [ ] Verify audit records private.
- [ ] Verify admin ID cannot be forged by passing arbitrary header.
