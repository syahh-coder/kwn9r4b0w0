# API Contract v0 → planned v1

## Implemented TODAY (scaffold, no AI)
- `GET /api/health` → `200 {"ok":true,"service":"cekfakta","mode":"scaffold"}`.
- `POST /api/check` accepts JSON, checks input shape and topic, returns `200` with `verdict:"unverified"`, `mode:"validation_only"` and explicit `analysisAvailable:false`.
- `POST /api/check` validation errors `400`/`415` with `{error:{code,message}}`; there is NO URL fetch, NO evidence lookup, NO Gemini call, NO DB write.

## v1 request
```json
{ "inputType":"text", "input":"Contoh klaim untuk diperiksa", "category":"education" }
```
Or `{"inputType":"url", "input":"https://example.org/news", "category":"politics"}`.

### Success after backend implementation
```json
{
  "id":"UUID",
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
- Real v1 must return `unverified` without evidence and treat platform errors distinctly from a factual conclusion.

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

`DELETE` mengarsipkan draft ke rejected; bukan hard delete. Publish harus aksi tersendiri dengan persetujuan review. Report, catatan dan sumber disimpan atomik melalui RPC migrasi 0004. Endpoint publik `/api/reports` dan detailnya masih belum tersedia (FE-02); `/api/check` tetap scaffold sebagaimana bagian awal.

## Error codes
`invalid_input` (400), `unauthorized` (401), `forbidden` (403), `not_found` (404), `rate_limited` (429), `fetch_blocked` (422), `evidence_unavailable` (returned as unverified), `service_unavailable` (503).

## Input policy
- JSON only; text length 20–5000 characters; URL max 2000 and HTTPS preferred; category one of `education`, `politics`, `conservation`.
- Before actual URL fetching, SSRF-safe hostname/IP/DNS/redirect inspection mandatory.
- No idempotent/unique DB behavior yet in scaffold; implement in v1.
