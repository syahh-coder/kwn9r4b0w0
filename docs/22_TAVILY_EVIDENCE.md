# DATA-04 — pencarian web dan pembandingan isi sumber

Pengguna memilih **Tavily untuk retrieval, Gemini untuk klaim/query dan pembandingan, draft/admin untuk keputusan editorial**, setelah peninjauan terms Google Grounding. Bukti/status akhir ada di TASKS.md dan docs/09_TEST_PLAN.md. Tidak mengaktifkan paid plan, billing, PAYG atau deployment otomatis.

## Implementasi

1. Setelah validasi/rate/budget/lease DB, Gemini mengekstrak satu klaim verbatim dan query ringkas. Tahun eksplisit tidak boleh hilang/berubah; URL dan field tambahan ditolak. Query bukan bukti dan tidak mengubah klaim.
2. Google Fact Check tetap dibaca sebagai metadata. Dalam mode web, Tavily dicari juga jika indeks menemukan kandidat: metadata tidak membuktikan isi sumber cocok.
3. Server memanggil endpoint tetap Tavily Search, basic, maksimal 3 hasil, tanpa auto_parameters/generated answer/retry. Key hanya Authorization server, bukan URL/client/model.
4. Raw content yang tidak tersedia dapat dibaca lewat satu batch Tavily Extract basic, maksimal 3 URL publik dari hasil sebelumnya. Hasil untuk URL lain ditolak. Jika tetap kosong, klien safe-fetch DATA-02 boleh mengambil HTML/plaintext publik, dengan DNS/IP/redirect/MIME/byte/deadline cap yang sama. Tidak menambah parser PDF atau fetch(userUrl) polos.
5. Maksimal 12.000 karakter per dokumen. Halaman panjang memakai satu passage kontinu di sekitar kepadatan istilah query/klaim, dengan tepi pada batas kalimat asli. Tidak merangkai potongan terpisah atau memotong negasi. Pemilihan passage membantu retrieval, bukan klasifikasi kebenaran.
6. Comparator hanya memakai dokumen yang memiliki isi, dipecah menjadi kalimat asli berurutan. Model wajib mengembalikan satu comparison per dokumen dan memilih quoteSentenceId, bukan mengetik ulang kutipan. Server mengambil satu kalimat unik 20–1000 karakter lalu memvalidasi span UTF-16/SHA-256 terhadap teks terbatas. Kalimat terlalu panjang/duplikat/ID palsu ditolak. Hubungan/context model tetap usulan, bukan otorisasi verdict. Sumber tidak relevan boleh unclear/quote null; jangan memaksa quote agar tes lulus. Validator literal tetap mendukung 1–3 kalimat pada boundary internal, tetapi generator kini memilih satu kalimat.
7. Commit report/catatan/provenance/preview atomik. Persist hanya kutipan minimum/hash/span, bukan artikel lengkap. Provider tavily memakai web_source_content atau web_search_metadata, tanpa rating ClaimReview palsu. Tanggal tidak tersedia tetap null. Kutipan/ID palsu menyebabkan gagal, bukan draft sukses.
8. Hasil selalu unverified/draft; admin meninjau sebelum publikasi. UI membedakan metadata yang belum terbaca, isi sumber, kutipan dan tanggal terbit/ulasan.

Jika Tavily sukses tanpa kandidat dan indeks Fact Check punya kandidat, metadata indeks masih dapat dipakai dengan keterbatasannya. Kegagalan/kuota provider tidak disamarkan sebagai pencarian kosong. Kehadiran teks/quote bukan jaminan semantic entailment atau fakta benar.

## Konfigurasi

Isi TAVILY_API_KEY di .env.local, WEB_SEARCH_ENABLED=true, lalu restart dev server. Helper untuk workspace loopback yang sudah siap:

```powershell
npm.cmd run setup:local-web-search
```

Helper hanya mengubah flag lokal, tidak mengganti key/model/hash/namespace atau billing. Template default false untuk lingkungan baru. Cache key policy check-v2-tavily mencegah hasil metadata lama menutupi retrieval baru; bucket subject/global tetap sama, bukan reset budget.

## Budget, timeout, akses

Migrasi 0006_web_evidence.sql menambah provenance dan RPC service-only reserve_web_search, hanya lease/token aktif dan sekali per lease. Token baru dapat reservasi lagi setelah lease lama berakhir; worker lama ditolak. Migrasi 0007_web_credit_budget.sql mencadangkan **2 kredit/check web**, total **20 kredit/hari UTC/namespace**: maksimal 10 check web baru/hari, atau lebih sedikit jika batas check lain tercapai. Reservasi yang tidak terpakai/gagal tidak dikembalikan.

Basic search 1 kredit; basic Extract menurut provider 1 kredit per 5 URL sukses. Reservasi 2 mencakup search dan satu batch kecil extract secara konservatif, bukan invoice pasti 2 kredit. Tanpa advanced/retry/pagination/auto upgrade. Maksimal dua generasi Gemini: klaim+query dan comparison/analisis metadata. Harga/asumsi di [docs/21](21_WEB_SEARCH_PRICING.md); kredit gratis akun dapat dipakai layanan lain dan tidak dijamin tersisa utuh.

Search/Extract memiliki deadline dan response cap 512.000 byte. Safe-fetch maksimal 3 halaman paralel mengikuti DATA-02. Route check/analyze maxDuration 90 detik, lease 90 detik, client timeout 95 detik. Timeout/proxy/transport hosting masih perlu staging; tidak mengklaim background queue.

complete_check membungkus implementasi atomik lama yang dipindah ke private dan tidak dapat dipanggil app roles. Preview menambahkan quote/tanggal/kind. RLS, editorial guard, audit dan admin JWT tetap berlaku. Migrasi hanya lokal, tanpa reset akun/data.

Teks provider adalah untrusted. Hash/span memverifikasi quote terhadap teks tersebut saat proses, bukan memastikan laman asli selalu sama atau izin menyalin artikel. Query dikirim ke pihak ketiga; pengguna tetap diminta tidak mengirim rahasia/data pribadi. Jangan mencetak key/isi artikel/model mentah ke log. Admin memeriksa sumber, atribusi dan kutipan minimum sebelum publikasi.

Diagnosis server dibatasi label tahap/status allowlist dan finish reason model; tidak mencetak klaim, URL, exception mentah atau respons provider. Error JSON/jumlah comparison/quote tetap gagal tertutup tanpa draft palsu. Tidak melakukan retry berbayar otomatis.

## Perbaikan DATA-05 dan contoh masukan

Sesudah DATA-04, dua percobaan pengguna masih ditolak comparison invalid_quote. Schema awal mengizinkan rentang ID kalimat global, termasuk kalimat pendek/duplikat/tidak layak dan ID yang hanya tersedia di sumber lain. Schema kini memakai varian per evidenceId dengan enum ID kalimat quotable milik dokumen itu saja; bila tidak ada, hanya unclear/null. Validator server tetap menolak ID/kutipan palsu. Ini memperkecil keluaran model yang salah tanpa menjadikan kutipan sebagai bukti kebenaran otomatis.

Pilih **Teks berita → Pendidikan**, lalu gunakan satu klaim berikut sebagai contoh input pemeriksaan (bukan keputusan fakta yang sudah disahkan):

```text
Berdasarkan laporan OECD melalui Programme for International Student Assessment (PISA) 2022, kemampuan siswa Indonesia dalam bidang membaca, matematika, dan sains masih berada di bawah rata-rata negara OECD.
```

Uji pada web dev pengguna menghasilkan HTTP 200, 3 sumber berisi teks/3 quote dan satu draft unverified. Replay formulir Chromium memakai cache/draft yang sama, menampilkan 3 quote dan tidak overflow pada 390px. Draft nyata contoh ini tetap disimpan untuk ditinjau admin; bukan fixture terbit atau verdict final. Keberhasilan contoh tidak menjamin setiap input selalu mendapat referensi/quote, dan status task akhir mengikuti TASKS.md.

## Pengujian

- npm.cmd run verify: lint/typecheck/unit+SQL/build.
- npm.cmd run test:browser: fixture Auth/RLS/CRUD/reports/browser tanpa provider; web dimatikan khusus suite agar tidak membuang kuota.
- npm.cmd run test:web-live: opt-in server produksi loopback/namespace itest_web_ sendiri; menguji klaim PISA pengguna, sumber/quote/hash/span, draft publik 404, cached API/browser/axe. Draft/namespace probe dibersihkan, tidak publish; akun pengguna dan dev server dipertahankan. Satu run dapat memakai 2 Gemini, 1 Fact Check, 1 Tavily Search, 1 batch Extract dan sampai 3 safe-fetch.
- npm.cmd run test:dev: regresi reload/HMR, bukan uji akurasi model.

Hasil dan kegagalan awal dicatat di docs/09. Tidak menjanjikan semua klaim mendapat sumber, semua PDF terbaca atau model memutuskan fakta tanpa admin.
