"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { parseCheckInput } from "@/lib/check-input.mjs";
import { parseCheckResult } from "@/lib/check-result.mjs";

export function CheckForm() {
  const id = useId();
  const [inputType, setInputType] = useState<"url" | "text">("text");
  const [values, setValues] = useState({ text: "", url: "" });
  const [category, setCategory] = useState("education");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReturnType<typeof parseCheckResult>>(null);
  const busy = useRef(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  function clearFeedback() { setError(""); setResult(null); }

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
        body: JSON.stringify(parsed.value), signal: AbortSignal.timeout(95000),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(typeof body?.error?.message === "string" && body.error.message.length <= 600 ? body.error.message : "Pemeriksaan belum berhasil. Silakan coba lagi.");
        return;
      }
      const checked = parseCheckResult(body);
      if (!checked) {
        setError("Respons layanan belum dapat ditampilkan. Silakan coba lagi nanti."); return;
      }
      setResult(checked);
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
          <p id={`${id}-hint`} className="hint">{inputType === "url" ? "Gunakan artikel HTTP/HTTPS publik tanpa informasi login. Akses tautan dapat dibatasi pengelola." : `${values.text.trim().length.toLocaleString("id-ID")} / 5.000 karakter · minimal 20 karakter`}</p>
        </div>
        <div className="form-bottom"><div className="field"><label className="field-label" htmlFor={`${id}-category`}>Topik berita</label>
          <select id={`${id}-category`} value={category} onChange={e => { setCategory(e.target.value); clearFeedback(); }}><option value="education">Pendidikan</option><option value="politics">Politik</option><option value="conservation">Konservasi Alam</option></select>
        </div><button className="button primary" type="submit" disabled={loading}>{loading ? "Memproses klaim…" : "Periksa Sekarang"}<span aria-hidden="true">→</span></button></div>
      </fieldset>
      <div aria-live="polite">{loading && <p className="hint">Memproses masukan, mencari referensi, dan menyiapkan hasil awal. Proses dapat memerlukan waktu; laporan tetap menunggu tinjauan admin.</p>}</div>
      {error && <div id={`${id}-error`} className="alert error" role="alert">{error} Anda dapat memperbaiki input atau mencoba kembali.</div>}
      <p className="form-note">Hasil awal membantu peninjauan bukti dan belum menjadi keputusan fakta. Tanpa bukti yang memadai, hasil tetap belum dapat diverifikasi. Hindari mengirim data pribadi atau rahasia.</p>
    </form>
    {result && <section className="card result" role="status" aria-label="Hasil awal pemeriksaan"><span className="badge inconclusive"><span aria-hidden="true">?</span> Belum dapat diverifikasi</span><h2>{result.claim}</h2><p>{result.summary}</p><p>{result.reason}</p><p className="notice">{result.notice}</p><p className="hint">{result.cached ? "Menampilkan hasil awal tersimpan untuk masukan yang sama." : "Draft tersimpan untuk tinjauan admin."} {result.analysisAvailable ? "Analisis membantu peninjauan; kecocokan konteks tetap diperiksa admin." : "Pencarian tidak menyediakan kandidat; tahap analisis model tidak dijalankan."}</p>
      {result.sources.length > 0 ? <><h3>Kandidat referensi</h3><ul>{result.sources.map((source, index) => <li key={`${source.url}-${index}`}>
        <a className="text-link" href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>
        <p className="hint">{source.publisher} · {source.kind === "claim_review_metadata" ? "Tanggal ulasan" : "Tanggal terbit"}: {(source.kind === "claim_review_metadata" ? source.reviewedAt : source.publishedAt) ? new Date((source.kind === "claim_review_metadata" ? source.reviewedAt : source.publishedAt)!).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" }) : "Tidak tersedia"}</p>
        {source.kind === "web_source_content" && <p className="hint">Isi sumber dibaca untuk pembandingan. {source.excerpt ? "Kutipan di bawah dicocokkan dengan teks yang tersedia." : "Belum ada kutipan relevan yang dipilih model."}</p>}
        {source.kind === "web_search_metadata" && <p className="hint">Tautan ditemukan, tetapi isi sumber belum dapat dibaca. Tautan ini belum menjadi bukti isi klaim.</p>}
        {source.excerpt && <blockquote className="source-excerpt">{source.excerpt}</blockquote>}
      </li>)}</ul></> : <p>Belum ada kandidat referensi yang ditemukan untuk klaim ini.</p>}
      <ul className="hint">{result.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul><p className="hint">ID draft: {result.id}. Draft belum tersedia pada daftar laporan publik.</p>
    </section>}
  </div>;
}
