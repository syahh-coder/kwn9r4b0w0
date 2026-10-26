# Lanjutkan CekFakta setelah BE-03

Lanjutkan project pada workspace ini dari state tersimpan. Baca AGENTS.md, AI.md, TASKS.md, docs/TEAM.md dan docs/16_SESSION_HANDOFF.md terlebih dahulu, lalu dokumentasi relevan sesuai read order dan DESIGN.md. Gunakan docs/15_ADMIN_REPORTS.md untuk kontrak BE-03. Jangan ulang planning atau membuat ulang fitur yang sudah tersedia.

BE-03 sudah DONE dan migrasi 0001–0004 terpasang di Supabase lokal. Login/admin CRUD/approval/retract/arsip/restore serta penyimpanan draft/sumber/catatan atomik sudah diuji. Hasil terakhir: lint/typecheck/build, 82 tes, acceptance HTTP Auth/PostgREST, smoke dan scan key client lulus. Endpoint analisis live serta review visual browser belum diuji. /check masih validation-only dan /reports belum membaca database.

Kerjakan FE-02 sekarang: hubungkan daftar dan detail laporan publik ke Supabase, termasuk search/filter/pagination serta empty/error/loading/not-found. Hanya tampilkan published; draft, rejected, catatan privat dan audit tidak boleh bocor. Laporan yang ditarik harus hilang dari publik. Gunakan desain dark yang sudah ada dan komponen reusable.

Periksa layanan Docker/Supabase lokal seperlunya; jangan reset DB, membuat ulang akun admin, mengganti .env.local, mencetak secret, menggunakan mock seolah fakta, mengaktifkan API publik atau deploy otomatis. Pertahankan final AI unverified/draft dan approval admin. Gunakan npm.cmd/npx.cmd di PowerShell.

Update FE-02 menjadi IN_PROGRESS sebelum edit. Implementasikan langsung, jalankan pemeriksaan relevan, perbaiki error dan perbarui TASKS/test plan/changelog berdasarkan hasil nyata. Laporkan dalam bahasa Indonesia: fitur yang berjalan, file berubah, hasil pengujian, batas/kendala dan tahap berikutnya. INT-01 menangani integrasi /check serta shared cache/budget/rate limit setelah FE-02.
