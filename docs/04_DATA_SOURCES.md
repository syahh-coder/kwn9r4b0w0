# Data & fact-check retrieval research (owner: Joshev)

## Pembaruan DATA-04 — 31 Oktober 2026

Pengguna memilih Tavily Search/Extract basic sebagai perluasan ke sumber web, terpisah dari metadata Google Fact Check. Gemini menyusun query dan membandingkan kalimat sumber; tidak menjadi penyedia fakta. Tanggal tidak diketahui tetap null, hash/span bukan bukti semantic truth, semua hasil draft/unverified sebelum admin. Tidak memakai Search Grounding untuk crawler/report DB karena batas terms. Konfigurasi/keamanan/status acceptance: [DATA-04](22_TAVILY_EVIDENCE.md), [harga/terms resmi](21_WEB_SEARCH_PRICING.md), TASKS.md.

## Riset DATA-01 — diperiksa 24 Oktober 2026

Login admin telah dikonfirmasi pengguna berhasil. Tahap berikutnya adalah sumber bukti, bukan klasifikasi Gemini tanpa referensi.

| Provider | Temuan sumber resmi | Keputusan implementasi |
|---|---|---|
| Google Fact Check Tools Claim Search | API resmi GET `https://factchecktools.googleapis.com/v1alpha1/claims:search`; API key diperlukan; terms pencarian mengacu Google APIs Terms | Kandidat provider MVP bersyarat. Adapter offline siap; belum dipanggil langsung atau diaktifkan pada API publik |
| MAFINDO/Yudistira | Halaman layanan publik menyediakan dokumentasi dan jalur Request API key; ketentuan layanan menyatakan konten milik MAFINDO | Tunda adapter/scraping sampai akses dan cakupan izin konten dikonfirmasi. Tidak menghubungi pihak lain otomatis |
| Dokumen primer | Perlu kebijakan akses per penerbit dan pencocokan klaim/waktu/lokasi/konteks | Review editorial manual dahulu; pengambilan URL otomatis menunggu DATA-02 |

Referensi primer:
- [Google Claim Search](https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims/search) — parameter query, languageCode, pageSize dan pagination.
- [Skema Claim/ClaimReview](https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims) — teks klaim, claimant, claimDate, publisher, URL, title, reviewDate, textualRating, languageCode.
- [Terms Fact Check Tools](https://developers.google.com/fact-check/tools/api/terms) dan [Google APIs Terms](https://developers.google.com/terms) — batas API, hak pihak ketiga, kepatuhan atribusi/ketentuan. Lisensi halaman dokumentasi bukan izin menyalin seluruh artikel penerbit.
- [API key via header](https://docs.cloud.google.com/docs/authentication/api-keys-use) — secret dikirim sebagai X-Goog-Api-Key, bukan bagian query URL.
- [MAFINDO layanan publik](https://turnbackhoax.id/layanan-publik) dan [ketentuan layanan](https://turnbackhoax.id/ketentuan-layanan).

### Kuota, biaya, dan aktivasi

Angka kuota/harga proyek belum dapat diverifikasi dari dokumentasi yang dibaca atau akses console. Tidak mengklaim API gratis/tanpa batas. Pemilik proyek harus memeriksa ketersediaan Fact Check Tools API, credentials, quotas dan biaya pada console proyek sebelum mengaktifkan. Jangan mengaktifkan billing atau Search Grounding otomatis.

`GOOGLE_FACTCHECK_API_KEY` hanya server-side, terpisah secara konfigurasi dari `GEMINI_API_KEY`. Adapter aktif hanya jika `FACTCHECK_SEARCH_ENABLED=true` dan key Fact Check terisi; kondisi default disabled. Tidak menggunakan key Gemini sebagai fallback. Tidak mengubah .env.local pengguna dan tidak menjalankan live request pada sesi riset ini.

### Kontrak dan batas adapter

Implementasi `src/lib/evidence/google-fact-check.mjs` + boundary `server.ts`. Tidak ada endpoint publik baru. Request ke hostname/path tetap, bahasa id, pageSize 5, timeout 8 detik, redirect ditolak, JSON maksimum 256.000 byte, tidak ada retry/pagination otomatis. Tidak mengikuti URL artikel dari respons.

Metadata dinormalisasi menjadi kandidat ber-ID hash: teks klaim, claimant, claimDate, URL ulasan, judul, publisher, domain, reviewDate, retrievedAt, originalRating dan languageCode. Tanggal yang tidak tersedia tetap null; retrievedAt berasal dari waktu pengambilan aktual. `contextVerified=false`, `evidenceKind=claim_review_metadata`; tidak ada verdict. Textual rating tidak dipetakan otomatis ke valid/hoax.

Status: disabled, not_configured, invalid_input, available, no_candidates, rate_limited, busy, unavailable. `no_candidates` hanya berarti respons tidak menyediakan kandidat yang lolos parser; bukan bukti klaim benar/salah. Kesalahan provider tidak disamarkan sebagai pencarian berhasil.

Deduplikasi metadata memakai URL tanpa fragment + teks klaim + tanggal klaim/ulasan. Perbedaan negasi, tahun, atau konteks tidak disatukan. Cache lima menit maksimum 128 query dan dedupe request berjalan maksimum 10 per proses; bukan rate limit/budget terdistribusi untuk Vercel. Respons dikopi agar caller tidak merusak cache. Persistensi Supabase, cache lintas instance dan rate limit masih belum tersedia.

### Sampel respons

Konfirmasi kuota dari pengguna setelah probe: console menampilkan **AllRequests per minute = 300**. Tidak menyimpulkan batas harian/biaya, tidak menaikkan kuota atau mengaktifkan billing. Shared budget/rate limit aplikasi tetap gate INT-01.

Pembaruan 24 Oktober 2026: probe opt-in `npm.cmd run test:factcheck` berhasil (HTTP 200, 5 kandidat, satu request). Dua URL metadata yang dikembalikan: https://turnbackhoax.id/articles/36974-salah-pengadilan-negeri-surakarta-menyatakan-ijazah-jokowi-palsu dan https://turnbackhoax.id/articles/31637, publisher `TurnBackHoax.ID`, reviewDate tidak tersedia (null). URL hanya dicatat sebagai provenance hasil pencarian, tidak diambil isinya dan tidak dipakai menetapkan verdict. Tidak menyimpan respons mentah/key/berita ke database. Normalisasi, payload repository dan replay cache lulus; kuota/biaya console tetap belum diketahui. Paragraf berikut merekam keadaan riset awal sebelum key tersedia.

Tidak ada respons API live yang direkam karena credential/kuota Fact Check belum diverifikasi. Skema respons resmi: `{claims:[{text,claimant,claimDate,claimReview:[{publisher:{name,site},url,title,reviewDate,textualRating,languageCode}]}],nextPageToken}`; setiap field sesuai dokumentasi dan dapat tidak tersedia.

`tests/fact-check-search.test.mjs` memakai fixture kontrak FIKTIF dengan example.org, hanya untuk pengujian. Fixture tidak dipakai dalam UI, model, atau database. Test mencakup provenance, metadata hilang, URL berbahaya, dedupe, negasi/tahun, cache, kuota, MIME, JSON rusak dan content cap. Ini bukan test safe URL fetch/DNS/SSRF ataupun kualitas semantic retrieval nyata.

### Kelanjutan

Pembaruan persistensi: repository/RPC sumber tersedia dan migrasi 0003 terpasang lokal; lihat docs/13_SOURCE_PERSISTENCE.md. Deduplikasi kini juga membedakan claimant (aktor). Kandidat dapat disimpan atomik pada draft yang sudah ada; live provider belum aktif dan cache pencarian belum terdistribusi.

DATA-02: klien URL aman dengan DNS/IP pinning, redirect revalidation, ukuran/MIME/timeout dan test SSRF sebelum dipakai. DATA-03: persistensi sumber dengan provenance, shared cache/budget dan uji provider langsung setelah credential siap. AI-01 menunggu bukti yang memadai; metadata kandidat saja belum cukup untuk memutuskan verdict.

## Candidate sources (verify license/rate limits individually)
1. Google Fact Check Tools API: https://developers.google.com/fact-check/tools/api — search fact-checked claims; it is not a comprehensive truth database.
2. Google Fact Check Explorer: https://toolbox.google.com/factcheck/explorer/search (research / manual checks).
3. MAFINDO / TurnBackHoax: https://turnbackhoax.id/ — request/verify API or content permissions before ingestion.
4. Source-of-record: official documents from relevant ministry, school, university, conservation organization, or authoritative datasets.

## Fetch requirements
- Respect robots.txt, ToS, attribution, rate-limit and copyright; short excerpts only.
- Preserve canonical URL, publish timestamp, fetched timestamp, source title, excerpt and subject claim.
- Claim search should tolerate paraphrases; retrieval ≠ fact verification.
- Return `no_evidence` if no sufficiently relevant source, not `valid` by default.

## Implementation order
1. Choose permissioned API (sample responses recorded sans secrets).
2. Prototype claim lookup with retry, timeout and caching.
3. Validate provenance and URL, normalize claim.
4. Unit tests against known fictional paraphrase/negation/date cases.

## Decisions to record
| Source | API? | Access policy | Cost/quota | Contact | Status |
|---|---|---|---|---|---|
| Google Fact Check Tools | API documentation | review | verify current | Joshev | TODO |
| TurnBackHoax / MAFINDO | check availability | review | verify current | Joshev | TODO |
