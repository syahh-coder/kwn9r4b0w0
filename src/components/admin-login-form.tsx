"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: fields.get("email"), password: fields.get("password") }) });
      if (!response.ok) { const body = await response.json(); setError(body.error?.message || "Login belum berhasil."); return; }
      router.replace("/admin"); router.refresh();
    } catch { setError("Layanan belum dapat dihubungi. Silakan coba lagi."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="card form-card" aria-busy={pending}>
    <fieldset disabled={pending} className="form-fields">
      <div className="field"><label className="field-label" htmlFor="admin-email">Email admin</label><input id="admin-email" name="email" type="email" autoComplete="username" maxLength={254} required /></div>
      <div className="field"><label className="field-label" htmlFor="admin-password">Kata sandi</label><input id="admin-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" maxLength={1024} required /><button className="password-toggle" type="button" aria-pressed={visible} aria-controls="admin-password" onClick={() => setVisible(!visible)}>{visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}</button></div>
      <button className="button primary" type="submit">{pending ? "Memeriksa akses…" : "Masuk sebagai admin"}</button>
    </fieldset>
    {error && <p className="alert error" role="alert">{error}</p>}
    <p className="form-note">Akses hanya untuk akun yang telah diberi izin oleh pengelola. Tidak ada pendaftaran publik.</p>
  </form>;
}

export function AdminLogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/admin/logout", { method: "POST" });
      if (!response.ok) { setError("Logout belum berhasil. Silakan coba lagi."); return; }
      router.replace("/admin/login"); router.refresh();
    } catch { setError("Layanan belum dapat dihubungi."); }
    finally { setPending(false); }
  }
  return <div><button className="button subtle" type="button" disabled={pending} onClick={logout}>{pending ? "Keluar…" : "Keluar"}</button>{error && <p role="alert" className="alert error">{error}</p>}</div>;
}
