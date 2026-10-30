# Security & privacy threat model

## Assets
Gemini key, Supabase admin auth/session, service role key (if any), unpublished draft reports, report sources, user-submitted URLs.

DATA-04 menambah TAVILY_API_KEY server-only. Query klaim dikirim ke Tavily; maksimum 3 sumber dan satu batch Extract, basic tanpa retry/upgrade. Sumber/kalimat/output model tetap untrusted. Model memilih ID kalimat dan server mengambil quote asli; tidak mengeksekusi instruksi halaman. Raw artikel hanya dalam memori, DB menyimpan quote minimum/hash/span. Budget web dibatasi PostgreSQL service-only per lease dan hari; cache policy berubah tanpa mereset budget subject. Log hanya label tahap/status allowlist. Batas/tarif/terms: [DATA-04](22_TAVILY_EVIDENCE.md), [harga](21_WEB_SEARCH_PRICING.md).

## Risks → controls
- **SSRF**: never directly fetch untrusted URL. HTTPS/HTTP only; deny localhost & all private, link-local, metadata, broadcast, multicast and reserved ranges (v4/v6); resolve DNS and recheck each redirect, pin actual connection to resolved public IP as possible; block alternate encodings, credentials and nonstandard ports; no auto-follow redirects without revalidation. Bound content size & 5–10 sec timeout, only HTML/text and allowed MIME; no browser rendering by default.
- **Prompt injection**: external pages, sources and user text untrusted; use structured JSON, allow-listed evidence IDs, no tools with broad permissions in same prompt, no secret exposure.
- **Admin bypass**: Supabase Auth server-side + membership check + RLS; CSRF mitigation for cookie-based writes; protected server functions.
- **Rate-limit**: shared store (Redis/KV/DB), per-IP & global budget, bot abuse controls. In-memory limit does not protect serverless deployments.
- **Cost abuse**: quota monitor, short prompt, dedup/caching, fail closed if key missing or free quota exhausted. Grounding/search may cost money separately from token generation.
- **Misinformation**: without matching evidence, unverified; automatic report draft only; admin approval for publish; documented retract/correction mechanism.
- **Data protection**: avoid collecting identity; IP anonymize in telemetry, no raw credentials or content in logs; document retention & deletion policy before launch.

## Pre-production gate

QA lokal 31 Oktober 2026: unit/adversarial/SQL, Auth/PostgREST/HTTP dan Chromium/axe lulus. Login kini memakai bounded JSON UTF-8 fatal 4 KB/5 detik; UI login/logout memiliki deadline. Arsip/retract meminta konfirmasi. Header nosniff, frame denial, referrer/permission policy dan CSP object/base/frame/form tersedia. CSP ini tidak membatasi script dengan nonce; React escaping dan fixture browser XSS lulus, bukan jaminan semua bentuk XSS. Batas release/retensi/operator: [QA lokal dan persiapan rilis](20_LOCAL_QA_RELEASE.md). Checklist berikut khusus lingkungan hosting tujuan, sehingga tidak dicentang hanya karena tes lokal lulus.

Pembaruan INT-01, 31 Oktober 2026: jalur check lokal kini terintegrasi. Shared rate/budget/cache/lease menggunakan RPC service-only dan tabel private PostgreSQL, body cap/deadline, HMAC tanpa IP mentah, URL safe client DATA-02, draft atomic/unverified. Local unit/HTTP private-IP/cap/rate dan satu TLS URL contoh lulus; flag URL lokal diaktifkan setelahnya. Ini bukan persetujuan public deployment. Header proxy tepercaya, transport hosting tujuan, kapasitas/rate/CAPTCHA, retention dan review visual tetap QA-01. Detail batas serta bukti: docs/19_CHECK_INTEGRATION.md. Paragraf berikut adalah catatan gate sebelum integrasi.
Implementasi internal DATA-02 kini tersedia; lihat `docs/12_URL_INGESTION.md` untuk detail dan batas pengujian. Uji resolver/stream/pinning terinjeksi bukan pengujian socket/TLS pada deployment. Checklist rilis di bawah tetap belum otomatis dicentang. `/api/check` belum mengambil URL pengguna; shared rate limit dan review rilis masih diperlukan sebelum aktivasi publik.

- [ ] Tests for SSRF redirects DNS rebinding, IPv6, link-local/metadata and oversized response
- [ ] Rate-limits on check/admin endpoints
- [ ] RLS cross-role tests
- [ ] CSRF/secure cookie checks
- [ ] API secret not visible in client bundle or logs
- [ ] Content safety, escaping & CSP review
- [ ] Legal/terms of data sources reviewed
- [ ] Docs/09 security cases pass
