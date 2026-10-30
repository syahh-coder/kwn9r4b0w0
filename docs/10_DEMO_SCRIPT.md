# Demo script — tugas Kewarganegaraan

## Story
1. Masalah literasi digital dan contoh variasi cara orang menyampaikan klaim.
2. Publik membuka tanpa akun, input teks/URL dan topik.
3. Sistem mengambil klaim, mencari kandidat referensi dan menyimpan hasil awal **unverified/draft** beserta alasan/batasan. Referensi metadata belum membuktikan klaim benar/salah; tidak ada auto-publish.
4. Jika bukti tidak cukup, sistem secara jujur mengeluarkan `Belum dapat diverifikasi`.
5. Draft masuk admin (login), ditinjau dan diperbaiki sebelum terbit.
6. Publik membuka daftar laporan, melihat sumber dan tanggal.

## Demo preparation
- Jalankan [QA lokal](20_LOCAL_QA_RELEASE.md) dan baca hasil [test plan](09_TEST_PLAN.md). Nyalakan Docker/Supabase dan dev server; gunakan akun admin sendiri, tanpa reset data. Hasil fixture di artifacts/qa berlabel fiktif, bukan berita untuk dipublikasikan.
- Siapkan 2–3 klaim dengan sumber yang boleh digunakan dan telah dicek manual; 1 kasus ambigu.
- Tidak menampilkan fakta palsu atau menyebut sumber yang tidak ada. Jika hanya scaffold, jelaskan fitur yang belum selesai.
- Kuota API dan internet bisa gagal: screenshot/traces dari pengujian sebelumnya dengan label waktu & kondisi; tidak berpura-pura live.

## Explaining civic impact
Dukung sikap kritis, etika berbagi informasi, partisipasi digital yang bertanggung jawab; manusia tetap memegang keputusan akhir.
