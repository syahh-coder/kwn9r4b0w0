# Pengambilan artikel dari URL — DATA-02

## Status

Implementasi internal server Node.js tersedia di `src/lib/ingestion/`. Belum dihubungkan ke `/api/check`: endpoint tersebut tetap validation-only. Tidak ada scraping atau pengambilan URL pengguna secara live dalam sesi implementasi ini. Sebelum dibuka publik, shared rate limit/budget dan review rilis tetap wajib.

## Alur yang diimplementasikan

1. Validasi URL HTTP/HTTPS, hanya port standar, tanpa kredensial/control characters/backslash/encoded authority. Tolak nama lokal dan IPv4 alternatif (decimal integer, hexadecimal, octal, shortened).
2. Validasi literal IP atau resolusi hostname menggunakan DNS sistem (`lookup` all/verbatim). Semua jawaban harus IP publik dan family konsisten. Jawaban kosong, campuran private/public, atau >64 record ditolak.
3. Batasi ke public unicast secara konservatif menggunakan ipaddr.js plus deny CIDR eksplisit. Blok private, loopback, link-local/metadata, shared address space, documentation, benchmarking, multicast, reserved, IPv4-mapped IPv6 dan IPv6 transisi. IPv6 hanya global unicast 2000::/3 di luar pengecualian. Ini dapat menolak sebagian alamat khusus yang sebenarnya routable; fail closed disengaja.
4. `http(s).request` dengan `agent:false` dan callback lookup terpin ke alamat yang telah divalidasi. URL hostname asli tetap dipakai untuk Host/TLS SNI/certificate checks. Tidak menerima proxy, Cookie, Authorization, atau header arbitrer dari pengguna.
5. Redirect 301/302/303/307/308 ditangani manual, maksimum tiga perpindahan. Setiap hop mengulang validasi URL dan DNS, termasuk hostname yang sama. Siklus dan downgrade HTTPS ke HTTP ditolak. Body redirect langsung dihentikan.
6. Deadline total delapan detik mencakup DNS, koneksi, header dan body. DNS yang selesai setelah deadline tidak boleh memicu koneksi. Batas header 16.384 byte dan body 512.000 byte, dengan pemeriksaan Content-Length dan penghitung byte streaming.
7. Hanya HTTP 200 dengan MIME text/html, application/xhtml+xml atau text/plain. Minta identity encoding dan tolak respons terkompresi untuk mencegah decompression bomb. Terima UTF-8/US-ASCII saja; teks tidak valid/charset lain ditolak secara eksplisit.
8. HTML diparse oleh parse5 tanpa browser, eksekusi JavaScript, atau pemuatan resource. Utamakan article, kemudian main, lalu body fallback. Kembalikan string teks, bukan HTML. Script/style/iframe/template/form/nav/header/footer/aside serta hidden/aria-hidden diabaikan. CSS tidak dievaluasi sehingga ini bukan jaminan teks identik dengan tampilan browser.

`retrieveSubmittedArticle(url)` pada boundary `server.ts` mengembalikan URL akhir, judul, tanggal terbit eksplisit jika dapat dibaca, waktu pengambilan, teks maksimum 12.000 karakter dan penanda truncation/scope. Teks <20 karakter ditolak. Metadata HTML tetap untrusted. Tanggal tidak tersedia tetap null; canonical/base URL dari HTML tidak diikuti.

## Batas semantik

Teks artikel adalah masukan klaim, bukan sumber pembuktian klaim itu sendiri. `contentKind=submitted_article`, `contextVerified=false`, tanpa verdict. Ekstraksi pernyataan faktual dan pencocokan waktu/lokasi/konteks masih pekerjaan AI-01. Artikel tidak menjadi valid hanya karena berhasil diambil. Teks hasil parse harus diperlakukan sebagai data untrusted oleh model; instruksi di dalamnya tidak boleh dijalankan.

## Error internal

`fetch_blocked`, `fetch_timeout`, `redirect_limit`, `content_too_large`, `unsupported_content`, `source_unavailable`, `insufficient_text`. Tidak mencetak URL/input, alamat jaringan, atau respons mentah. Belum ada perubahan kontrak API publik karena kode belum diekspos.

## Pengujian dan review

`tests/article-ingestion.test.mjs`: 12 test dengan resolver dan transport terinjeksi serta stream fixture. Menguji kategori IP terlarang, URL alternatif/credential/port, mixed DNS, metadata redirect, rebinding pada hostname sama, redirect relatif/limit/siklus/downgrade, DNS deadline, callback pinning, response cap, encoding/MIME/charset, incomplete response, koneksi macet, metadata/null date, ekstraksi teks/entitas HTML, markup dalam dan truncation.

Review kode pada sesi implementasi memperketat encoded hostname dan batas byte parser langsung. Seluruh fixture fiktif dan tidak ditampilkan di UI/DB. Tes menjalankan implementasi opsi transport Node tetapi mengganti primitive request; **tidak membuktikan koneksi socket/TLS nyata atau jaringan Vercel**. Tidak ada test yang sengaja menghubungi metadata/internal network. Review independen dan acceptance live pada infrastruktur deployment masih bagian QA/rilis, bukan klaim sudah dilakukan.

Referensi implementasi: [Node HTTP request/lookup](https://nodejs.org/api/http.html), [ipaddr.js](https://github.com/whitequark/ipaddr.js), dan [parse5](https://github.com/inikulin/parse5). Kebijakan aplikasi tetap `docs/07_SECURITY_PRIVACY.md`; fitur ini tidak memberi izin menyalin konten semua penerbit.
