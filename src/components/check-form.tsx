"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { parseCheckInput } from "@/lib/check-input.mjs";

export function CheckForm() {
  const id = useId();
  const [inputType, setInputType] = useState<"url" | "text">("url");
  const [values, setValues] = useState({ text: "", url: "" });
  const [category, setCategory] = useState("education");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  function clearFeedback() { setError(""); setMessage(""); }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    clearFeedback();
    const parsed = parseCheckInput({ inputType, input: values[inputType], category });
    if (!parsed.ok) {
      setError(parsed.reason || "Periksa kembali masukan Anda.");
      inputRef.current?.focus();
      return;
    }
    busy.current = true; setLoading(true);
    try {
      const response = await fetch("/api/check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.value), signal: AbortSignal.timeout(15000),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(response.status === 429 ? "Terlalu banyak permintaan. Tunggu sebentar sebelum mencoba lagi." : body?.error?.message || "Pemeriksaan belum berhasil. Silakan coba lagi.");
        return;
      }
      if (body.mode !== "validation_only" || body.analysisAvailable !== false || body.verdict !== "unverified" || typeof body.message !== "string") {
        setError("Respons layanan belum dapat ditampilkan. Silakan coba lagi nanti."); return;
      }
      setMessage(body.message);
    } catch {
      setError("Layanan belum dapat dihubungi atau waktu tunggu habis. Periksa koneksi dan coba lagi.");
    } finally { busy.current = false; setLoading(false); }
  }

  return <div className="check-widget">
    <form className="card form-card" onSubmit={onSubmit} noValidate aria-busy={loading}>
      <fieldset disabled={loading} className="form-fields">
        <fieldset className="toggle-wrap"><legend className="sr-only">Jenis masukan</legend>
          <div className="toggle">{(["url", "text"] as const).map(mode => <label key={mode} className={inputType === mode ? "selected" : ""}>
            <input type="radio" name={`${id}-mode`} checked={inputType === mode} onChange={() => { setInputType(mode); clearFeedback(); }} />
            {mode === "url" ? "Tautan berita" : "Teks berita"}
          </label>)}</div>
        </fieldset>
        <div className="field"><label className="field-label" htmlFor={`${id}-input`}>{inputType === "url" ? "Tautan artikel" : "Klaim yang ingin diperiksa"}</label>
          {inputType === "url" ? <input ref={node => { inputRef.current = node; }} id={`${id}-input`} type="url" required maxLength={2000} placeholder="https://example.org/artikel (contoh)" value={values.url} aria-invalid={!!error} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} onChange={e => { setValues({ ...values, url: e.target.value }); clearFeedback(); }} /> :
            <textarea ref={node => { inputRef.current = node; }} id={`${id}-input`} required minLength={20} maxLength={5000} rows={5} placeholder="Tuliskan klaim beserta waktu, lokasi, dan konteksnya." value={values.text} aria-invalid={!!error} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} onChange={e => { setValues({ ...values, text: e.target.value }); clearFeedback(); }} />}
          <p id={`${id}-hint`} className="hint">{inputType === "url" ? "Gunakan tautan HTTP/HTTPS tanpa informasi login. Isi tautan belum diambil." : `${values.text.trim().length.toLocaleString("id-ID")} / 5.000 karakter · minimal 20 karakter`}</p>
        </div>
        <div className="form-bottom"><div className="field"><label className="field-label" htmlFor={`${id}-category`}>Topik berita</label>
          <select id={`${id}-category`} value={category} onChange={e => { setCategory(e.target.value); clearFeedback(); }}><option value="education">Pendidikan</option><option value="politics">Politik</option><option value="conservation">Konservasi Alam</option></select>
        </div><button className="button primary" type="submit" disabled={loading}>{loading ? "Memeriksa format…" : "Periksa Sekarang"}<span aria-hidden="true">→</span></button></div>
      </fieldset>
      <div aria-live="polite">{loading && <p className="hint">Mengirim input untuk validasi format.</p>}</div>
      {error && <div id={`${id}-error`} className="alert error" role="alert">{error} Anda dapat memperbaiki input atau mencoba kembali.</div>}
      <p className="form-note">Saat ini hanya validasi format. Pencarian bukti dan analisis Gemini belum tersedia.</p>
    </form>
    {message && <section className="card result" role="status" aria-label="Hasil validasi input"><span className="badge inconclusive"><span aria-hidden="true">?</span> Belum dapat diverifikasi</span><h2>Format diterima. Klaim belum diperiksa.</h2><p>{message}</p><p className="hint">Sumber bukti belum tersedia. Tidak ada laporan yang dibuat, disimpan, atau dipublikasikan.</p></section>}
  </div>;
}
