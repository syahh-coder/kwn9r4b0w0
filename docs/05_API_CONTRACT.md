# API Contract — CekFakta

## Pemeriksaan terintegrasi — INT-01
- `GET /api/health` → `200 {"ok":true,"service":"cekfakta","mode":"integrated"}` (liveness, bukan jaminan kesiapan provider).
- `POST /api/check` memakai provider server, shared DB rate/budget/lease/cache, ekstraksi teks/URL aman dan penyimpanan draft/provenance atomik. Hasil otomatis selalu unverified/draft. Konfigurasi/provider yang tidak siap -> 503, bukan hasil contoh atau validation-only.
- URL opsional lewat PUBLIC_URL_CHECK_ENABLED; false -> 422 dengan saran memakai teks. No factual claim -> 422 tanpa report. Tidak ada auto-publish. Detail batas/cache/config/keamanan: [Integrasi pemeriksaan](19_CHECK_INTEGRATION.md).

## Request
```json
{ "inputType":"text", "input":"Contoh klaim untuk diperiksa", "category":"education" }
```
Or `{"inputType":"url", "input":"https://example.org/news", "category":"politics"}`.

### Success
```json
{
  "id":"UUID",
  "mode":"analysis",
  "cached":false,
  "verdict":"unverified",
  "reviewStatus":"draft",
  "analysisAvailable":true,
  "claim":"...",
  "summary":"...",
  "reason":"...",
  "sources":[{"url":"https://...","title":"...","publishedAt":null}],
  "notice":"Belum direview admin"
}
```
- `analysisAvailable` bisa false jika pencarian sukses tanpa kandidat: draft tetap unverified, analisis metadata model dilewati. Ekstraksi klaim tetap menggunakan model. `limitations` dan `notice` disertakan; preview sumber juga memiliki publisher/reviewedAt. Tidak ada URL atau confidence dari model yang diterima sebagai bukti baru.
- Error: 400 input/JSON, 413 body >22000 byte, 415 MIME, 409 processing, 422 URL/claim tidak dapat diproses, 429 rate/budget/concurrency, 503 konfigurasi/provider/storage. Seluruh respons no-store; Retry-After untuk processing/limit. Body read 5 detik, route Node dengan maxDuration 90; client timeout 95 detik.

## Admin endpoints
### Autentikasi admin — sudah diimplementasikan

- `POST /api/admin/login`: JSON `{email,password}`, Origin harus cocok Host. 200 `{ok:true}` hanya jika Supabase Auth berhasil dan ID pengguna ada di admin_users; cookie sesi disimpan HttpOnly. 400 input invalid, 401 kredensial salah, 403 non-admin/origin ditolak, 413 >4 KB, 415 non-JSON, 429 rate limit Auth, 503 konfigurasi/layanan gagal. Tidak mencetak kredensial atau respons Auth mentah.
- `POST /api/admin/logout`: Origin harus cocok Host; 200 `{ok:true}` dan hapus sesi lokal, 403 origin ditolak, 503 kegagalan layanan.
- `GET /api/admin/session`: 200 `{admin:true}`, 401 tanpa sesi valid, 403 bukan admin, 503 layanan/konfigurasi tidak tersedia. Cache-Control private/no-store. Tidak mengembalikan token atau data draft.

CRUD admin sudah diimplementasikan pada BE-03. Kontrak request, status error dan alur review lengkap: [Pengelolaan laporan admin](15_ADMIN_REPORTS.md). Semua endpoint admin memerlukan Supabase Auth + allowlist/RLS; mutation memerlukan Origin sama, JSON bounded, dan perubahan memakai versi `expectedUpdatedAt`.

| Method + path | Auth | Function |
|---|---|---|
| GET `/api/reports` | Public | Published only, pagination & filters |
| GET `/api/reports/:id` | Public | Published only |
| GET `/api/admin/reports` | Admin | Draft queue and all reports |
| GET `/api/admin/reports/:id` | Admin | Detail, sumber, catatan privat, audit |
| POST `/api/admin/reports` | Admin | Create report draft |
| POST `/api/admin/reports/analyze` | Admin | Pipeline AI-01 menjadi draft unverified, jika provider diaktifkan |
| PATCH `/api/admin/reports/:id` | Admin | Edit/report publish/retract |
| DELETE `/api/admin/reports/:id` | Admin | Soft delete/retract preferred |

`DELETE` mengarsipkan draft ke rejected; bukan hard delete. Publish harus aksi tersendiri dengan persetujuan review. Report, catatan dan sumber CRUD manual disimpan atomik melalui RPC migrasi 0004. Endpoint publik reports tersedia FE-02; check terintegrasi INT-01. Endpoint admin analyze kini memakai service/cache/budget INT-01 dan mengembalikan `{report:{id}}` setelah auth/Origin/schema valid.

## Pembacaan laporan publik — FE-02

`GET /api/reports?q=&category=&verdict=&page=1` mengembalikan `{reports,total,page,pageSize:12}` published-only, pencarian literal klaim maksimal 150 karakter, kategori/verdict whitelist dan halaman 1–1000. Query tidak dikenal/berulang atau nilai salah -> 400. `GET /api/reports/:id` mengembalikan `{report}` dengan penjelasan dan sumber; draft/rejected/retracted/tidak ada/ID salah -> 404. Gangguan layanan -> 503. Semua respons no-store, selalu memakai anon tanpa sesi admin dan projection kolom publik. Kontrak field dan batas lengkap: [Laporan publik](18_PUBLIC_REPORTS.md).

## Error codes
DATA-04: sources check menambahkan kind (claim_review_metadata/web_source_content/web_search_metadata), excerpt literal/null dan publishedAt ISO/null; reviewedAt tetap tanggal ulasan/null. Tidak mengirim body artikel/hash/token/key. Kegagalan provider/budget web -> 503 web_search_unavailable, bukan no_evidence palsu. Route check/analyze maxDuration 90 detik; client timeout 95 detik. Detail: [web evidence](22_TAVILY_EVIDENCE.md).

Login membatasi body 4 KB dan pembacaan 5 detik (408 `request_timeout`); UTF-8 rusak ditolak 400. MIME harus tepat `application/json` (parameter charset diperbolehkan), bukan awalan seperti `application/jsonp`. Pembatas percobaan password memakai Supabase Auth; analisis admin memakai budget/rate DB yang sama dengan check publik.

`invalid_input` (400), `unauthorized` (401), `forbidden` (403), `not_found` (404), `rate_limited` (429), `fetch_blocked` (422), `evidence_unavailable` (returned as unverified), `service_unavailable` (503).

## Input policy
- JSON only; text length 20–5000 characters; URL max 2000 and HTTPS preferred; category one of `education`, `politics`, `conservation`.
- Before actual URL fetching, SSRF-safe hostname/IP/DNS/redirect inspection mandatory.
- Masukan identik memakai HMAC request key, lease lintas proses dan cache hasil awal 5 menit; perubahan draft admin membatalkan reuse cache. Tidak mengedit report published melalui kiriman publik.
