# PRD — CekFakta MVP

## Actors
- **Guest**: submit teks atau URL; melihat hasil sementara dan report published; tidak ada registrasi.
- **Admin**: login, lihat drafts, tambah/edit/hapus draft, approve/publish/retract report; semua aksi di-audit.

## Public journey A — Check
1. Guest membuka home → `Cek Berita`.
2. Pilih input `Teks` atau `URL`, pilih topik (Pendidikan / Politik / Konservasi Alam).
3. Server validasi input, rate-limit. Jika URL, fetch aman, baca judul/tanggal/teks; berikan error jika sumber tidak dapat diakses.
4. Search sumber pembanding dan hasil fact-check yang ada; catat URL, penerbit, published/collected time dan kutipan minimum.
5. LLM membandingkan klaim dengan bukti; jika klaim tak cocok / bukti lemah / konflik sumber → `unverified`.
6. Show provisional result + sumber + catatan belum disetujui admin; simpan **draft** jika pipeline berhasil.
7. Admin review → approve publish; report publik terlihat di menu `Report`.

## Public journey B — Report
1. Tanpa login, guest melihat daftar report `published` saja.
2. Filter kategori/verdict, search judul, buka detail untuk penjelasan, tanggal verifikasi dan sumber.
3. Report yang di-unpublish hilang dari daftar publik.

## Admin journey
1. `/admin/login` → Supabase Auth; server checks admin allowlist/role.
2. Dashboard draft queue, detail with sources and warnings, edit & approve/reject/retract, add/delete.
3. Admin actions logged (who/when/what). Non-admin cannot read drafts/write data.

## Verdict & workflow
- `hoax`: bukti kredibel langsung bertentangan dengan klaim yang diuji.
- `valid`: bukti kredibel langsung mendukung klaim dalam konteks relevan.
- `unverified`: tidak ada cukup bukti, berbeda konteks, konflik, atau sistem gagal memproses.
- `review_status`: `draft`, `published`, `rejected` (draft awal, admin publish manual).

## Constraints & quality
- Only 3 topics; free-tier aware; cache duplicate; no promised response time without measurement.
- Accessibility: labels, keyboard, semantic headings; responsive & clear warning.
- Security: rate limit, SSRF, max chars/bytes, safe errors, no key disclosure; auth/RLS.
- Anti-misinformation: no unsupported verdict; show why and original source URLs; no automatic public accusations.

## Non-goals (MVP)
User accounts, user comments, real-time scraping of all news outlets, machine-learning training, OCR, upload multimedia, social login, self-serve public report creation.

## Acceptance
See `docs/09_TEST_PLAN.md`; each acceptance criterion is observable.
