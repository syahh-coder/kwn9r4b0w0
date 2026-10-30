# Laporan publik — FE-02

Status lokal: DONE, 30 Oktober 2026. Daftar/detail laporan dan Home membaca data Supabase yang benar-benar published. Tidak ada berita contoh disisipkan ke database pengguna. Pembaruan 31 Oktober: formulir /check sudah terintegrasi melalui INT-01; hasil tetap draft dan tidak muncul publik sebelum approval admin. Detail terbaru: docs/19_CHECK_INTEGRATION.md. Instruksi INT-01 sebagai tahap berikutnya di bagian historis dokumen ini sudah dikerjakan; lanjut QA-01.

## Cara mencoba

1. Nyalakan Docker/Supabase lokal dan `npm.cmd run dev` sesuai setup sebelumnya.
2. Buka `/admin`, buat draft berdasarkan klaim serta sumber yang benar-benar ingin ditinjau. Simpan penjelasan/sumber; lakukan review dan persetujuan publikasi sesuai docs/15_ADMIN_REPORTS.md.
3. Buka `/reports` tanpa login. Laporan published muncul pada daftar, detail serta laporan terbaru di Home. Jika belum ada published, halaman memang kosong; tidak ada cron atau pengisian berita otomatis pada FE-02.
4. Cari kata/frasa dalam klaim, pilih kategori dan hasil. Filter disimpan dalam URL, sehingga bisa dibagikan. Submit filter kembali ke halaman pertama. Tombol hapus filter tersedia saat pencarian aktif.
5. Tarik publikasi dari admin lalu muat ulang detail/daftar publik. Laporan tidak tampil pada request baru dan detail mengembalikan 404. Data yang sudah diunduh ke browser sebelumnya tidak bisa ditarik kembali dari riwayat/screenshot pengguna.

## Kontrak publik

- `GET /api/reports?q=frasa&category=education&verdict=unverified&page=1`: 200 `{reports,total,page,pageSize:12}`. Semua query opsional. Pencarian hanya pada teks klaim, case-insensitive, substring literal; `%`, `_` dan backslash di-escape. Karakter kontrol dan `*` ditolak, karena wildcard alias PostgREST bukan pencarian literal. Maksimal 150 karakter, page integer 1–1000. Hanya tiga kategori dan tiga verdict yang didukung. Query tidak dikenal/berulang atau nilai salah -> 400.
- Item daftar hanya `{id,claim,category,verdict,reviewStatus:"published",summary,publishedAt,updatedAt}`. Urutan publishedAt desc, ID desc sebagai tiebreaker agar pagination deterministik. Halaman melewati hasil mengembalikan daftar kosong dan count terfilter, bukan service error; saat PostgREST memberi PGRST103/416 dilakukan satu HEAD count tambahan.
- `GET /api/reports/[id]`: 200 `{report}` dengan field daftar, `reason` dan `sources`. ID salah/tidak ada/draft/rejected/retracted -> 404 yang sama. Gangguan layanan -> 503, tidak disamarkan menjadi data kosong.
- Sumber hanya `{id,url,title,publisher,excerpt,publishedAt,reviewedAt,collectedAt,kind,matchedClaim}`. URL yang gagal pemeriksaan protokol/format metadata menjadi null dan tidak dibuat tautan. Pembacaan sumber dibatasi 100 per detail; aplikasi admin normal membatasi sumber editorial/kandidat lebih kecil dari itu. Tanggal ulasan dipisahkan dari tanggal terbit; tanggal hilang ditampilkan Tidak tersedia, bukan hasil perkiraan.
- Semua respons API no-store. Server page dynamic dan fetch ke Supabase no-store. Tidak memakai cookie/sesi admin atau service_role. Query selalu published-only, explicit field projection, filter terstruktur, RLS anon dan deadline query 5 detik. Tidak mengembalikan report_private, audit, admin_notes, published_by, rating model atau credential. Error SDK tidak dicetak/dikirim mentah.

## UI dan keamanan

Daftar menampilkan label verdict dengan ikon/teks, kategori, ringkasan dan tanggal publikasi. Detail memisahkan hasil klaim dari status editorial Ditinjau admin; published tidak otomatis valid. Sumber eksternal menggunakan noopener/noreferrer dan teks di-render sebagai teks biasa, tanpa HTML/Markdown sumber dieksekusi.

Daftar/Home punya loading nyata melalui Suspense. Detail memeriksa akses/ketersediaan sebelum render sehingga laporan privat/tidak ada benar-benar mengirim HTTP 404, bukan 200 akibat streaming loading. UI gangguan layanan memberi retry; pencarian tanpa hasil dan halaman di luar jangkauan punya pesan serta aksi yang sesuai.

Tidak mengubah skema DB, API write/admin, kebijakan verdict, key/flag pengguna atau mengaktifkan URL ingestion/model publik. Tidak mengklaim status layanan atau kuota API eksternal dari halaman laporan.

## Bukti pemeriksaan

- Lint, typecheck dan build PASS; npm.cmd test 89/89 PASS.
- Test baru memakai SDK Supabase nyata dengan transport fixture untuk verifikasi filter, escaping, projection, pagination, source URL, missing ID, private result fail-closed, error layanan dan fallback count 416.
- test:local PASS pada Auth/PostgREST/HTTP aktual: admin create/publish/retract/archive/restore; draft tersembunyi meski request memakai cookie admin; detail publik dan sumber tampil setelah publish; catatan privat/audit/ID penerbit tidak bocor. Search/filter serta 13 fixture published sementara menghasilkan 12+1, tanpa duplikasi; halaman di luar hasil dan filter kosong juga berhasil. Home/list/detail SSR diverifikasi melalui HTML. Semua akun/laporan fixture dibersihkan.
- Smoke publik PASS; key Gemini/Fact Check tidak ditemukan pada bundle client. Tidak ada request provider live atau migrasi pada sesi ini.
- Uji awal menemukan detail not-found status 200 dan pagination kosong status 503; keduanya sudah diperbaiki dan acceptance diulang lulus. Review visual/interaksi browser pada ukuran mobile/desktop belum dilakukan; tidak dinyatakan lulus.

Berikutnya INT-01: pemeriksaan publik terhubung ke pipeline dan draft, shared budget/rate limit/cache/idempotency, serta review gate URL ingestion. Jangan memperkenalkan cache laporan publik yang tetap mengembalikan data setelah retraction tanpa strategi invalidasi.
