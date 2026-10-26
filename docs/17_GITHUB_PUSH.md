# Push pertama ke GitHub

Kode saat handoff masih lokal dan belum memiliki commit/remote. Prosedur ini untuk repository GitHub baru yang kosong; jangan centang penambahan README, .gitignore atau license saat membuat repo karena file proyek sudah tersedia. Push kode tidak memindahkan database Supabase, akun admin atau environment ke cloud, dan tidak otomatis men-deploy aplikasi.

## PowerShell

Ganti URL repository di baris pertama, lalu jalankan dari terminal PowerShell:

```powershell
$repoUrl = 'https://github.com/USERNAME/NAMA_REPO.git'
$repoPath = 'D:/ProjectWeb/02_CEKFAKTA_AGENTIC_WORKSPACE'
Set-Location -LiteralPath $repoPath

git -c safe.directory="$repoPath" add .
git -c safe.directory="$repoPath" diff --cached --stat
git -c safe.directory="$repoPath" commit -m "feat: CekFakta MVP sampai BE-03"
git -c safe.directory="$repoPath" branch -M main
git -c safe.directory="$repoPath" remote add origin "$repoUrl"
git -c safe.directory="$repoPath" push -u origin main
```

`safe.directory` di atas hanya berlaku pada masing-masing command untuk mengatasi ownership workspace; tidak mengubah pengaturan keamanan global. Jika Git meminta identitas sebelum commit, atur untuk repo ini saja dengan nama dan email GitHub milikmu (boleh email noreply GitHub), lalu ulangi commit dan baris setelahnya:

```powershell
git -c safe.directory="$repoPath" config user.name "NAMA_KAMU"
git -c safe.directory="$repoPath" config user.email "EMAIL_GITHUB_KAMU"
```

Saat Git meminta autentikasi HTTPS, ikuti login browser/Git Credential Manager. Jangan menaruh token di URL remote atau file proyek. Jika muncul `remote origin already exists`, ganti perintah `remote add` dengan:

```powershell
git -c safe.directory="$repoPath" remote set-url origin "$repoUrl"
```

Jika satu command gagal, berhenti dan tangani error itu sebelum menjalankan command berikutnya. Jangan gunakan force push untuk menyelesaikan konflik repository yang ternyata sudah berisi commit.

## Yang dikecualikan

`.env.local` dan variasi `.env*` (kecuali template kosong `.env.example`), node_modules, .next, build cache, log, .vercel, metadata CLI lokal Supabase serta SQL pribadi Studio di supabase/snippets. Migrasi supabase/migrations, package-lock, kode dan dokumentasi tetap masuk repo.

Sebelum commit, ringkasan staged harus tidak memuat environment asli atau snippet SQL pribadi. Kredensial dan database lokal tetap disimpan terpisah di komputer pengguna.
