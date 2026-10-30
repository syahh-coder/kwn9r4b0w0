# Pengelolaan laporan admin — BE-03

## Status dan prasyarat

Implementasi lokal menggunakan Supabase Auth, allowlist `admin_users`, sesi user dan RLS. Tidak menggunakan service-role pada operasi aplikasi. Migrasi `0004_admin_reports.sql` sudah diterapkan pada Supabase lokal tanpa reset. Cloud belum dimigrasikan atau dideploy.

Antrean berada di `/admin`, editor di `/admin/new` dan `/admin/[id]`. Akun yang sudah dibuat mengikuti [setup admin](11_ADMIN_SETUP.md); tidak ada password baru atau akun permanen dari agen.

## Langkah mencoba

1. Nyalakan Docker/Supabase lokal dan jalankan `npm.cmd run dev`, lalu masuk lewat `/admin/login`.
2. Pilih **Buat draft**. Isi klaim 20–5000 karakter dan satu dari tiga kategori. Laporan baru selalu `unverified`/`draft`.
3. Isi ringkasan, penjelasan dan sumber asli. Kutipan dibatasi 2000 karakter per sumber; tanggal yang tidak diketahui boleh kosong. Catatan internal disimpan terpisah dan tidak terbaca publik.
4. Pilih **Simpan draft**. Report, catatan privat dan sumber tersimpan dalam satu transaksi; kegagalan salah satu bagian membatalkan seluruh perubahan.
5. Buka sumber dan periksa klaim, waktu, aktor, lokasi serta konteks secara editorial. Hasil `valid`/`hoax` hanya dipilih admin setelah pemeriksaan bukti; tautan atau rating provider saja tidak cukup. Simpan perubahan.
6. Centang persetujuan pemeriksaan, lalu pilih **Setujui dan publikasikan**. Ringkasan, penjelasan dan minimal satu sumber wajib ada; database menetapkan identitas admin serta waktu publikasi. Persetujuan adalah tanggung jawab editorial, bukan bukti otomatis bahwa penilaian sudah benar.
7. Laporan published harus **ditarik ke draft** sebelum diedit. **Arsipkan draft** memakai status `rejected`, menyembunyikan laporan sambil mempertahankan sumber dan audit. **Kembalikan ke draft** tersedia untuk arsip. Tidak ada hard delete melalui aplikasi.
8. Jika dua tab mengedit versi yang sama, salah satu perubahan ditolak dengan `409`. Muat ulang laporan dan tinjau perubahan terbaru sebelum menyimpan lagi. Tombol perubahan status dinonaktifkan saat masih ada perubahan formulir yang belum disimpan.

Halaman publik `/reports`, detail dan Home membaca published melalui akses anon (FE-02). Setelah publikasi admin laporan dapat dibuka tanpa login; penarikan menyembunyikannya pada request baru. `/check` kini terhubung ke pipeline/draft dengan budget/cache/lease INT-01. Panduan: [Laporan publik](18_PUBLIC_REPORTS.md) dan [Integrasi check](19_CHECK_INTEGRATION.md).

## Draft bantuan Gemini

Pembaruan INT-01: endpoint analyze memakai worker/key backend dan service/budget/cache yang sama dengan check, sesudah verifikasi admin/Origin. Memerlukan PUBLIC_CHECK_ENABLED serta konfigurasi lainnya sesuai docs/19_CHECK_INTEGRATION.md. Hasil baru masih draft unverified; cache kiriman identik dapat mengembalikan ID draft awal yang sama. RPC editorial manual di bawah tetap menggunakan JWT admin.

Di formulir baru, **Analisis teks menjadi draft** menggunakan teks klaim dan kategori saja. Ringkasan, sumber editorial serta catatan formulir yang belum tersimpan tidak digunakan oleh aksi ini. Prasyarat backend: flag PUBLIC_CHECK_ENABLED/GEMINI_ANALYSIS_ENABLED/FACTCHECK_SEARCH_ENABLED, model/key provider, key worker Supabase dan hash secret sesuai docs/19_CHECK_INTEGRATION.md. Setup lokal INT-01 telah menyiapkannya; konfigurasi cloud tetap terpisah.

Service INT-01 memanggil pipeline AI-01, lalu buildAnalysisDocument memvalidasi final unverified/draft dan ID referensi. Complete RPC menyimpan report, catatan privat, provenance dan cache preview atomik. Usulan verdict model tidak disimpan sebagai keputusan final. Pencarian sukses tanpa kandidat boleh menghasilkan draft unverified tanpa panggilan analisis metadata model; ekstraksi sebelumnya tetap menggunakan model. Kegagalan provider/model tidak disamarkan sebagai hasil kosong. No factual claim tidak membuat laporan. Helper saveAnalysisDraft lama tetap tersedia untuk sink admin terisolasi, tetapi bukan route analyze terbaru.

Ini alur metadata ClaimReview; tidak mengambil isi artikel atau otomatis menyatakan konteks cocok. Kandidat provider ditampilkan terpisah dari sumber editorial, tetap tersimpan saat sumber editorial diganti. Admin harus membuka dan memeriksa referensinya. Modul full-text comparator AI-01 belum otomatis dipanggil oleh endpoint ini.

Tidak ada retry otomatis. Jika jaringan terputus setelah operasi, periksa antrean sebelum mengulang agar tidak membuat draft ganda. Deduplikasi kiriman, budget/rate limit terdistribusi dan integrasi publik tetap INT-01. Pengguna melaporkan kuota Fact Check **300 request/menit**; ini bukan bukti batas harian, biaya atau jaminan kapasitas aplikasi.

## Kontrak dan batas keamanan

- `GET /api/admin/reports?status=draft&page=1`: 20 laporan per halaman, status draft/published/rejected, metadata antrean saja.
- `GET /api/admin/reports/[id]`: laporan, sumber, catatan privat dan maksimal 50 audit terbaru; admin saja.
- `POST /api/admin/reports`: `{claim,category,verdict:"unverified",summary,reasoning,adminNotes,sources}`. Sumber `{url,title,excerpt,publishedAt:null|ISO timestamp}`. Hasil `201 {report}`.
- `PATCH /api/admin/reports/[id]`: dokumen editorial yang sama dan `expectedUpdatedAt` dari respons terakhir; atau `{action:"publish"|"retract"|"restore"|"reject",expectedUpdatedAt,reviewed?:boolean}`. Publish wajib `reviewed:true`.
- `DELETE /api/admin/reports/[id]`: `{action:"reject",expectedUpdatedAt}`; arsip draft saja.
- `POST /api/admin/reports/analyze`: `{text,category}`; admin saja, hasil `201 {report}` jika draft tersimpan. Kegagalan analisis `503`, klaim tidak ditemukan `422`.
- Semua mutation wajib Origin sesuai Host, JSON, body maksimal 100000 byte, pembacaan maksimal 5 detik. Tidak menerima ID penerbit, status publikasi atau kandidat sumber dari payload publik/editor biasa. Semua respons API private/no-store.
- Guest `401`, non-admin `403`, ID/filter/input tidak valid `400`, tidak ditemukan `404`, konflik versi/status edit `409`, body besar `413`, MIME salah `415`, kelengkapan publikasi/transisi salah `422`, gangguan layanan `503`.
- RPC `save_report_draft` dan `admin_report_action` adalah SECURITY INVOKER, execute authenticated saja dengan pemeriksaan allowlist dan RLS. Tidak mencabut guard/audit yang sudah ada. Operasi report langsung oleh admin tepercaya melalui Studio tetap mengikuti guard database lama; checkbox aplikasi bukan pembatas privilege operator database.

## Pengujian

`npm.cmd test`: 82/82 lulus, termasuk rollback report/sumber/catatan, invalid provenance, versi lama, publikasi tanpa review/bukti, sumber published, arsip/restore serta isolasi peran.

`npm.cmd run test:local`: lulus dengan Auth/PostgREST/HTTP nyata; akun dan laporan fiktif sementara dibersihkan. Dua edit concurrent menghasilkan `200`/`409`. Sink analisis diuji dengan hasil fiktif terinjeksi, tanpa request Gemini/Fact Check. Endpoint analisis live dan review visual/interaksi browser belum diuji pada sesi ini. Lint, typecheck, build dan smoke juga lulus.
