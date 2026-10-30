# Pencarian sumber web: harga, akses dan keputusan integrasi

Diperiksa 31 Oktober 2026. Status dan bukti akhir DATA-04 mengikuti [TASKS.md](../TASKS.md). Pengguna menyetujui alur klaim → pencarian → baca isi sumber → analisis → draft/admin dan paid bila diperlukan. Tidak ada upgrade billing atau pembayaran yang dilakukan agen.

**Pembaruan keputusan:** pengguna memilih Tavily dan mengonfirmasi TAVILY_API_KEY tersimpan lokal. Adapter Search/Extract, query Gemini, budget, migrasi dan UI tersedia; bukti acceptance dan aktivasi lokal pada TASKS.md/docs/09. Implementasi: [docs/22](22_TAVILY_EVIDENCE.md). Bagian di bawah menjelaskan riset dan koreksi dari saran Grounding.

## Batas integrasi sebelum DATA-04

Pipeline saat ini mengambil klaim lewat Gemini, lalu mencari indeks Google Fact Check dalam bahasa Indonesia. Respons kosong yang berhasil menghasilkan draft unverified tanpa kandidat; hasil identik dapat dibaca dari cache 5 menit. Ini tidak berarti seluruh web sudah dicari atau tidak ada sumber primer. Fact Check, Search Grounding, URL Context dan analisis token Gemini adalah kemampuan/biaya berbeda.

## Google: harga resmi yang diperiksa

| Komponen | Harga nominal |
|---|---|
| Gemini 3.5 Flash-Lite Standard paid, input | US$0,30 / 1.000.000 token |
| Gemini 3.5 Flash-Lite Standard paid, output termasuk thinking | US$2,50 / 1.000.000 token |
| Google Search Grounding, setelah alokasi | US$14 / 1.000 query pencarian |
| Google Search Grounding, ekuivalen 1.000.000 query | US$14.000 sebelum alokasi gratis |

Pricing mencantumkan Grounding tidak tersedia di Free Tier model ini. Paid mencakup 5.000 pencarian/bulan bersama seluruh model Gemini 3 dan yang lebih baru; jumlah yang masih tersisa pada akun pengguna belum diketahui. Satu prompt/check bisa memicu beberapa query, sehingga satu request aplikasi bukan satu query maupun sejuta token. Dokumentasi mencantumkan cap default Grounding 1.500 request/hari untuk proyek paid Gemini 3+, bukan janji kapasitas sejuta request/bulan.

Sumber: [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing?hl=en), [mekanisme Grounding dan tagihan query](https://ai.google.dev/gemini-api/docs/google-search?hl=en).

Dokumentasi [billing](https://ai.google.dev/gemini-api/docs/billing?hl=en) mengarahkan pengguna ke AI Studio Projects/API Keys → Set up billing pada proyek yang sama. Proses dapat memerlukan akun/metode pembayaran dan saldo awal minimal US$5, atau menawarkan/menetapkan postpay sesuai akun. Agen tidak memiliki koneksi akun Billing/metode pembayaran dan tidak melakukan proses tersebut. Jangan meminta user mengirim detail kartu, OAuth token, atau password melalui chat.

Probe akses yang diizinkan pengguna: satu generateContent dengan googleSearch pada key/model server yang sudah ada, timeout 30 detik, retry 1, output cap 512. Ditolak HTTP 429 terkait kuota/free tier; tidak ada generasi/sumber yang berhasil. Tidak menyimpulkan rekening billing aktif, biaya gratis, atau akun punya kuota dari sekadar key yang terisi. Secret/response error mentah tidak dicetak; tidak menulis draft/provider result ke DB.

## Koreksi pilihan Search Grounding

Hasil peninjauan [Gemini API terms, Grounding with Google Search](https://ai.google.dev/gemini-api/terms#grounding-with-google-search): penggunaan Grounded Results/Search Suggestions/Links memiliki pembatasan crawl, caching dan sindikasi, serta ketentuan tampilan kepada pengirim prompt. Karena itu Grounding tidak disambungkan sebagai pengumpul URL untuk fetch dan database laporan publik. Pengecualian tertentu dalam terms tidak dianggap izin umum membangun database report.

Ini mengoreksi saran awal sebelum terms lengkap diperiksa. Pengguna telah diberi tahu menunda aktivasi billing untuk jalur ini. Jangan mengaktifkan flag Grounding, mengambil link Grounding untuk crawler, menyimpan hasilnya ke cache/report, atau menyalin hasil tool menjadi sumber lain agar pembatasan tampak hilang. Alternatif tool harus dinilai berdasarkan kebutuhan report dan ketentuan penyedia/sumber aslinya.

## Alternatif yang diajukan: Tavily untuk retrieval

[Tavily credits](https://docs.tavily.com/documentation/api-credits) mencantumkan 1.000 kredit gratis per bulan tanpa kartu, basic search 1 kredit/request, advanced 2 kredit/request, PAYG US$0,008/kredit. Maka basic setara **US$8 per 1.000 pencarian**, atau **US$8.000 per sejuta**, sebelum alokasi gratis, diskon volume dan pajak. Ini tidak termasuk token Gemini atau ekstraksi terpisah; dokumen provider merinci biaya extract tersendiri. Akun/key disiapkan pengguna; agen tidak membuat akun, menyetujui order atau mengaktifkan PAYG.

[Search endpoint](https://docs.tavily.com/documentation/api-reference/endpoint/search) menyediakan opsi hasil dan raw_content untuk integrasi AI. [Terms Tavily](https://www.tavily.com/terms) menyebut integrasi Customer Applications, disertai pembatasan penggunaan dan hak pihak ketiga. Pemilihan ini bukan klaim izin menyalin seluruh artikel penerbit; pertahankan atribusi dan kutipan minimum, tanpa otomatis memutuskan fakta atau menerbitkan laporan.

Pilihan provider telah dimintakan ke pengguna karena mengubah layanan/account/key. Setelah dipilih, baru implementasikan adapter terkait, validasi respons, provenance URL/isi/tanggal, citation/quote guard, shared budget sebelum request, cache yang sesuai terms, serta pengujian end-to-end. Jangan menyebutnya aktif hanya karena dokumentasi ini tersedia.

## Contoh estimasi aplikasi

Mode implementasi dapat menambah satu batch basic Extract untuk maksimal 3 URL. Menurut provider, basic Extract 1 kredit per 5 URL sukses, nominal US$1,60 per 1.000 halaman berhasil sebelum alokasi/pajak. Budget aplikasi mencadangkan maksimum 2 kredit/check (search+batch extract), bukan invoice pasti 2. Contoh di bawah mengecualikan extract, sehingga bukan biaya pasti seluruh pipeline.

Asumsi ilustratif untuk satu pemeriksaan: total seluruh panggilan Gemini **3.000 token input + 1.000 token output/thinking**, dan **1 basic search atau 1 Google query**. Ini bukan pengukuran pemakaian aplikasi, bukan invoice, dan bukan jaminan satu pemeriksaan selalu satu pencarian. Angka di bawah mengabaikan cache, alokasi gratis, pajak, ekstraksi tambahan dan diskon.

| Volume pemeriksaan | Token Gemini paid | Search Grounding nominal | Jumlah nominal jika Grounding | Tavily basic nominal | Jumlah nominal jika Tavily |
|---|---:|---:|---:|---:|---:|
| 1.000 | US$3,40 | US$14 | US$17,40 | US$8 | US$11,40 |
| 1.000.000 | US$3.400 | US$14.000 | US$17.400 | US$8.000 | US$11.400 |

Rumus token: `N × ((3000 / 1000000 × 0.30) + (1000 / 1000000 × 2.50))`.

Angka Grounding ditampilkan untuk menjawab pertanyaan biaya, **bukan rekomendasi integrasi DB report**. Jika semua sejuta Google query terjadi pada satu periode dan seluruh alokasi 5.000 masih tersedia, bagian pencarian nominalnya menjadi US$13.930; tier/cap aktual tetap harus memenuhi volume itu. Harga tidak dikonversi ke rupiah agar tidak mengarang kurs. Pembatas biaya aplikasi saat ini tetap batas pipeline lama; jangan mengklaim budget web search tersedia sebelum diimplementasikan.
