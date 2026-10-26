# Setup admin lokal

## Yang sudah tersedia

Login email/kata sandi Supabase Auth di `/admin/login`, logout, dashboard terlindungi, dan `GET /api/admin/session`.
Dashboard kini menyediakan antrean, detail, draft/editor/sumber/catatan privat dan approval/retraction/arsip BE-03. Alur Gemini admin tersedia jika flag/provider diaktifkan; `/check` publik tetap validation-only. Panduan penggunaan: [Pengelolaan laporan](15_ADMIN_REPORTS.md).

## Membuat akun admin milik pengelola

1. Nyalakan Supabase lokal dan buka Studio dari URL hasil `npx.cmd supabase status`.
2. Di bagian Authentication / Users, buat akun dengan email dan kata sandi milik pengelola. Pastikan akun terkonfirmasi untuk login password. Jangan taruh password dalam source code atau chat.
3. Salin ID pengguna (UUID), lalu jalankan di SQL Editor **instance lokal yang sama**:

```sql
insert into public.admin_users (user_id)
values ('GANTI_DENGAN_UUID_PENGGUNA_AUTH')
on conflict (user_id) do nothing;
```

4. Jalankan `npm.cmd run dev`, buka `/admin/login` dan masuk menggunakan akun tersebut. Akun Auth tanpa baris allowlist akan ditolak.
5. Setelah logout, akses `/admin` harus mengarah kembali ke login.

Pencabutan akses: hapus baris allowlist pengguna melalui akses operator tepercaya. Pemeriksaan berikutnya di server akan menolak akses, meskipun sesi Auth masih berlaku. Jangan memberi publik izin menulis `admin_users`.

## Konfigurasi dan batas keamanan

- Aplikasi hanya menggunakan URL Supabase dan publishable/anon key. Tidak memakai service role untuk pemeriksaan admin atau membuat bypass.
- `auth.getUser()` memverifikasi sesi ke Auth server. Setiap akses terlindungi memeriksa membership database, lalu query aplikasi tetap mengikuti RLS dengan JWT pengguna.
- Proxy memperbarui cookie sesi sebelum render; cookie memakai HttpOnly, SameSite=Lax, Path=/ dan Secure pada build production. Pada pengembangan HTTP gunakan `npm.cmd run dev`.
- Login/logout hanya POST dengan Origin yang cocok Host aplikasi. JSON login dibatasi 4 KB, email 254 karakter, password 1024 karakter; password tidak di-trim.
- Auth memakai rate limit bawaan Supabase; shared rate limit aplikasi masih tugas INT-01. Tidak ada pendaftaran publik pada aplikasi. Sebelum rilis, nonaktifkan signup publik yang tidak diperlukan pada konfigurasi Supabase.
- `/admin` tanpa login redirect; API sesi memberi 401 tanpa sesi, 403 jika non-admin, 503 jika konfigurasi/layanan/membership gagal diperiksa. Halaman non-admin menampilkan penolakan tanpa data privat.
- Halaman/API admin tidak boleh di-cache bersama. Auth tidak mempercayai role dari header pengguna atau user metadata.
- `.env.local` dan variasi nama `.env*` diabaikan Git, dengan pengecualian template `.env.example`.

## Pengujian ulang

Jalankan lint, typecheck, test, build. Untuk acceptance Auth/Data API/HTTP lokal, jalankan build aplikasi di terminal terpisah:

```powershell
npm.cmd run start -- --hostname 127.0.0.1 --port 3100
```

Lalu:

```powershell
npm.cmd run test:local
```

Script menolak endpoint selain HTTP loopback dan mengharuskan URL Supabase aplikasi cocok dengan CLI lokal. Script membuat dua akun sementara dengan password acak, memberi satu akun izin admin, menguji draft/sumber/catatan/audit lintas role, publish/retract lewat JWT, login salah/non-admin/admin, cookie HttpOnly/Lax, CSRF, pencabutan role dan logout, lalu menghapus fixture. Secret CLI hanya di memori dan tidak dicetak. Script memakai Docker container dari project_id workspace ini; jika project_id diubah, sesuaikan target test.

Tidak menguji tampilan browser, expiry sesi dengan menunggu waktu nyata, deployment Vercel, atau Gemini. Akun test dihapus sehingga tidak dapat dipakai login manual.

Referensi: [SSR Supabase](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [password login](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).
# Pengelolaan laporan setelah login

BE-03 kini menyediakan antrean, buat/edit draft, sumber, catatan privat, publikasi, retraction dan arsip. Gunakan [panduan pengelolaan laporan](15_ADMIN_REPORTS.md). Akun admin yang sudah berhasil digunakan tetap berlaku; tidak perlu membuat akun atau password baru.

