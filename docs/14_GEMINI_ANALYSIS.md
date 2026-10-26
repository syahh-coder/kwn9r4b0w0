# AI-01 — Modul Gemini server

## Status akhir

**DONE untuk modul AI server.** Model `gemini-3.5-flash-lite` berhasil menjalankan acceptance live pada fixture fiktif: ekstraksi klaim, JSON analysis/citation allowlist, serta perbandingan isi sumber dengan quote provenance. BE-03 kini menyediakan penyimpanan draft atomik serta CRUD/approval admin; formulir publik belum terhubung.

Provider DATA-03 sudah lulus probe live HTTP 200 dengan 5 kandidat. Pengguna melaporkan kuota 300 request/menit. BE-03 menyediakan endpoint analisis admin dengan sink draft/provenance; sink teruji lokal tanpa panggilan provider baru, sedangkan endpoint analisis live belum diuji pada sesi BE-03. INT-01 tetap menangani penyambungan publik serta rate limit/cache/budget bersama. `/api/check` tetap validation-only.

## Modul dan batas kepercayaan

- `claim-extraction.mjs`: ekstraksi maksimal satu kandidat klaim, 1–3 kalimat utuh sepanjang 20–1000 karakter, dari teks maksimum 12.000 karakter. Quote harus exact substring unik; span UTF-16 dan SHA-256 dihitung server terhadap teks masukan, bukan HTML asli. Subject/time/location harus substring literal quote atau null. Waktu relatif tidak diberi tahun rekaan. `verbatim=true` membuktikan provenance teks, bukan factuality; `factualityVerified=false`.
- `evidence-analysis.mjs`: JSON schema dan validasi field persis, claim/category tidak berubah, reviewStatus draft, allowlist ID, panjang/array bounded. URL/citation karangan, confidence/extra fields, auto-publish dan drift klaim ditolak. Metadata ClaimReview/rating bukan bukti kesimpulan, sehingga final verdict selalu unverified dengan penjelasan netral server. Usulan model terpisah sebagai proposedAnalysis, untrusted dan untuk calon tinjauan admin saja.
- `evidence-comparison.mjs`: maksimal lima dokumen server yang terkait ID dan URL kandidat. Teks maksimum 12.000 karakter per dokumen, total input JSON 48.000 byte. Model mengusulkan supports/contradicts/unclear serta context actor/time/location/event. Kutipan harus benar-benar ada pada dokumen terkait, unik dan berupa 1–3 kalimat utuh; server mencatat hash/span. Relation yang tegas wajib quote; unclear boleh null. ID salah/quote buatan/source omission membatalkan comparison.
- `claim-pipeline.mjs`: ekstraksi → retrieval → optional full-text comparison → analysis. Tidak punya kemampuan menulis database atau publikasi. No-factual-claim menghentikan proses. Error retrieval/model/comparison tidak disamarkan sebagai bukti kosong atau fallback sukses. Label konteks mekanis membantu review; tanpa flags pun contextVerified tetap false.
- `server.ts`: SDK resmi @google/genai, server-only, key dari GEMINI_API_KEY, model eksplisit GEMINI_MODEL. Entry point reviewTextForAdmin memeriksa getUser + allowlist dan kesiapan provider sebelum model spend. Lower-level comparator dapat dipakai alur BE-03 dengan dokumen yang disediakan server; adapter pencarian belum otomatis mengambil isi URL reviewer karena izin/rate-limit tetap harus dipenuhi.

## Kebijakan verdict MVP

Kecocokan kata, quote yang benar-benar muncul, rating sumber, maupun label konteks dari model tidak cukup untuk menetapkan fakta. Karena belum ada pemeriksaan editorial tepercaya yang mengotorisasi verdict otomatis, **semua draft otomatis tetap unverified**, termasuk usulan model valid/hoax atau dokumen yang dilabeli matches oleh model. Ini keputusan fail-closed MVP, bukan klaim semantic truth verification otomatis sudah terpecahkan.

Jika full-text comparison tersedia, draft menjelaskan bahwa isi sumber sudah dibandingkan tetapi konteks/kesimpulan masih perlu review admin. EvidenceIds final hanya dari sumber dengan quote provenance yang lolos. Kutipan yang tidak ada di teks, ambiguitas atau error comparison menggagalkan tahap itu. Klaim yang berbeda tahun, negasi atau peristiwa diuji; kandidat bernegasi tidak otomatis dibuang karena bisa merupakan sanggahan yang relevan.

ProposedAnalysis, comparisons dan context labels tetap untrusted/editorial-only. Jangan menjadikannya verdict publik tanpa review admin. Tidak ada confidence probabilistik, sumber baru, atau URL keluaran model yang dipercaya.

## Konfigurasi dan pengendalian request

```env
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_ANALYSIS_ENABLED=false
```

Key tetap di `.env.local`, tidak dicetak atau dikirim dalam contents. Flag default false; tidak diubah otomatis pada sesi penyelesaian. Model mengikuti nilai environment tanpa fallback. Tidak mengaktifkan Google Search Grounding, URL context, code execution, web tools, billing atau cloud migration.

SDK memakai Developer API (`vertexai:false`), timeout 15 detik dan attempts=1, tanpa retry aplikasi. Deadline mencakup generate; output maksimum 16.000 byte (ekstraksi 8.000), token analisis/ekstraksi 2048, comparison 3072. Abort client bukan jaminan operasi remote/billing berhenti. Claim/source text diperlakukan sebagai data tidak tepercaya dalam system instruction yang terpisah; ini mitigasi prompt injection, bukan kekebalan model.

Provider error/disabled/key tidak tersedia → evidence_unavailable dengan draft null. Pencarian sukses no_candidates → draft unverified tanpa memanggil tahap analisis model. Error model dibedakan menjadi model_not_found, model_access_denied, model_request_rejected, model_rate_limited, model_unavailable dan model_timeout, tanpa response mentah.

## Bukti acceptance

- `npm.cmd run test:gemini` awal setelah model diganti pengguna: PASS dua request generasi (ekstraksi + metadata analysis).
- Probe final yang diperluas: PASS tiga request (ekstraksi + analysis + full-text comparison). Fixture sepenuhnya fiktif, URL example.org tidak diambil, tidak ada laporan/akun/data DB yang ditulis. Lima request generasi sukses dalam sesi penyelesaian; bukan benchmark kualitas atau bukti kebenaran berita.
- Unit/SQL regression mencakup no evidence/no call, invalid output/IDs/URLs, context drift, sumber salah tahun/negasi, metadata downgrade, full-text quotes, injection, timeout dan quota errors. Hasil final dicatat di TASKS.md dan docs/09_TEST_PLAN.md.
- Tidak mengulang integrasi Supabase/HTTP karena rute/database tidak berubah. Tidak menguji UI/browser atau pipeline publik yang belum disambungkan.

## Command opt-in

`npm.cmd run check:gemini` hanya mengambil metadata model; metadata sukses tidak menjamin generate berhasil. `npm.cmd run test:gemini` melakukan sampai tiga request generasi live dengan fixture, membutuhkan key/model aktif dan dapat memakai kuota/biaya. Tidak termasuk npm test. Jangan menjalankannya berulang tanpa alasan verifikasi baru.

## Riwayat 404

Pada sesi sebelumnya model lama mengembalikan metadata tetapi generation probe gagal HTTP 404 dua kali. Itu dicatat sebagai FAILED. Pengguna kemudian mengubah GEMINI_MODEL menjadi gemini-3.5-flash-lite; probe sekarang PASS. Tidak menyimpulkan semua model 2.5 telah dimatikan secara universal atau mengganti key/billing secara otomatis.

Referensi resmi: [structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [SDK HTTP options](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpOptions.html), [Models API](https://ai.google.dev/api/models), [deprecation](https://ai.google.dev/gemini-api/docs/deprecations), dan [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).
# Pembaruan BE-03

Pipeline internal kini menyertakan kandidat `sources` pada hasilnya untuk sink `saveAnalysisDraft`. Endpoint admin `POST /api/admin/reports/analyze` menghubungkan ekstraksi/pencarian/analisis metadata dengan penyimpanan atomik report, batasan dalam catatan privat dan provenance sumber. Tetap unverified/draft, tanpa mengambil artikel/full-text otomatis dan tanpa membuka `/api/check`. Aktivasi provider mengikuti environment pengguna, tidak diubah agen. Sink diuji dengan fixture terinjeksi pada unit/SQL serta Auth/PostgREST nyata; endpoint provider live baru ini belum diuji pada sesi BE-03. Panduan terbaru: [pengelolaan laporan](15_ADMIN_REPORTS.md). Keterangan integrasi belum tersedia di bagian historis berikut merujuk keadaan sebelum BE-03.

