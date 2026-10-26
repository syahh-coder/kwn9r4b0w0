# Persistensi kandidat referensi — DATA-03

## Kemampuan yang tersedia

Migrasi `0003_source_provenance.sql` memperluas `report_sources` tanpa menghapus data lama. Sumber editorial lama tetap valid. RLS published-only, guard sumber draft, dan audit dari migrasi 0001/0002 tetap berlaku.

Kandidat Google ClaimReview dapat disimpan pada **laporan draft yang sudah ada** menggunakan `persistReportCandidates(client, reportId, candidates)`. Modul server-only menyediakan orkestrasi internal `searchAndStoreReportCandidates(reportId, query)`: verifikasi admin dan draft sebelum menghubungi provider, normalisasi hasil, lalu simpan lewat RPC. Tidak ada endpoint aplikasi baru, report creation, atau publikasi otomatis.

## Provenance yang disimpan

- `candidate_key`, `provider`, `evidence_kind` — identitas deduplikasi dan penanda metadata ClaimReview.
- `source_url`, `source_title`, `source_domain`, `publisher` — tautan dan atribusi penerbit.
- `matched_claim`, `claimant`, `claim_date` — klaim yang dibahas provider, belum tentu sama konteks dengan masukan pengguna.
- `review_date`, `original_rating`, `language_code` — metadata ulasan asli tanpa pemetaan rating ke verdict.
- `collected_at` — waktu retrieval dari server; tanggal hilang tetap null.

`source_published_at` tidak diisi dari reviewDate karena tanggal ulasan bukan otomatis tanggal terbit artikel. Tidak menyimpan seluruh body respons provider, instruksi, verdict, review_status atau flag contextVerified dari payload. Metadata bukan bukti kecocokan konteks dan tetap membutuhkan review/pencocokan di AI-01 serta admin.

Hash deduplikasi meliputi URL tanpa fragment, teks klaim, claimant, tanggal klaim dan tanggal ulasan. Perbedaan aktor, negasi dan tahun tidak digabung. Constraint unik parsial `(report_id,candidate_key)` mencegah duplikasi termasuk saat permintaan bersamaan. Replay mengabaikan metadata baru untuk key sama, mempertahankan provenance pertama; ini bukan mekanisme refresh artikel.

## Transaksi dan akses

`attach_report_candidates(uuid,jsonb)` bersifat SECURITY INVOKER dengan search_path kosong. EXECUTE untuk authenticated/service_role, dicabut dari PUBLIC/anon. Pengguna authenticated non-admin tetap tidak bisa menulis karena RLS serta pemeriksaan draft. `service_role` hanya diperuntukkan worker tepercaya; aplikasi sesi admin tidak menggunakannya.

Maksimal 20 kandidat per RPC. Semua insert dalam satu transaksi: validasi/constraint yang gagal membatalkan seluruh batch. Sumber hanya ditambahkan ke draft dan setiap insert melewati guard/audit. Tidak mengubah sumber atau laporan published. Constraint bentuk provenance, unique index, dan hak akses juga berlaku pada penulisan langsung melalui Data API.

Repository memvalidasi ulang payload dan ID sebelum mengirim. Error database/exception transport dipetakan ke kode netral tanpa mencetak detail, credential, atau konten sumber. Menyimpan kandidat tidak pernah mengubah verdict laporan atau menyatakan konteks sudah diverifikasi.

## Hasil verifikasi lokal

- Migrasi 0003 diterapkan hanya pada Supabase lokal melalui `npx.cmd supabase migration up --local`, tanpa reset data/cloud.
- Unit test repository serta SQL RLS/transaction dijalankan bersama test lain. Uji mencakup rollback batch, idempotensi, tanggal null/terpisah, permission dan penolakan published.
- `npm.cmd run test:local` memakai GoTrue dan PostgREST nyata: dua permintaan RPC bersamaan menghasilkan tepat satu sumber, replay nol insert, batch invalid tidak meninggalkan insert parsial, non-admin/anon ditolak, draft privat, sumber published terbaca dan retraction menghilangkannya. Regresi auth/CSRF/logout dan smoke HTTP juga lulus.
- Akun/laporan/sumber fixture fiktif dibersihkan. Tidak ada sampel provider live atau data demo tersimpan sebagai berita nyata.

## Sisa pekerjaan

Status terbaru setelah konfirmasi pengguna: Google Cloud menampilkan AllRequests per minute **300**. Angka ini dilaporkan pengguna, bukan pembuktian batas harian atau biaya. BE-03 kini menghubungkan sink analisis admin dengan RPC draft/provenance atomik; lihat [panduan laporan](15_ADMIN_REPORTS.md). Shared cache/budget dan aktivasi publik tetap gate INT-01. Paragraf di bawah mencatat urutan hasil probe serta keadaan historis.

Pembaruan 24 Oktober 2026: pengguna telah mengisi key dan mengaktifkan flag pencarian. `npm.cmd run test:factcheck` lulus dengan satu request HTTP 200 dan 5 kandidat nyata; normalisasi, payload provenance serta replay cache lulus. Probe tidak menulis database dan tidak mengambil artikel: pengujian persistensi RPC tetap bukti lokal yang dijelaskan di atas. Angka kuota/biaya pada console pengguna belum diverifikasi; jangan menganggap request berhasil membuktikan kuota gratis tertentu. Catatan key belum tersedia pada paragraf berikut adalah riwayat sesi persistensi awal.

`GOOGLE_FACTCHECK_API_KEY` belum tersedia dan `FACTCHECK_SEARCH_ENABLED` masih false pada saat sesi ini. Tidak memanggil provider langsung, mengaktifkan API/billing atau mengganti .env.local. Validasi provider nyata masih diperlukan setelah credentials/terms/kuota proyek diperiksa. Cache dan dedupe pencarian masih per proses; shared budget/rate-limit/cache harus diselesaikan sebelum jalur publik diaktifkan (INT-01). `/api/check` tetap validation-only; belum ada hasil Gemini atau penyimpanan report dari kiriman pengguna.

Referensi: [RPC Supabase](https://supabase.com/docs/reference/javascript/rpc), [hak akses fungsi](https://supabase.com/docs/guides/database/functions), [PostgreSQL ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html).
