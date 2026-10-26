"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { categories, reviewStatuses, safeSourceUrl, verdicts } from "@/lib/reports/validation.mjs";
import type { AuditEntry, EditorialSource, ReportDetail, ReportSummary } from "@/lib/reports/types";

async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, cache: "no-store", signal: AbortSignal.timeout(60000),
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Permintaan gagal. Coba lagi nanti.");
  return data;
}
const label = (map: Record<string, string>, value: string) => map[value] || value;
const timestamp = (value: string) => new Date(value).toLocaleString("id-ID");
const auditLabel = (value: string) => {
  const [table, operation] = value.split(":");
  return `${label({ reports: "Laporan", report_sources: "Sumber", report_private: "Catatan internal" }, table)}: ${label({ insert: "ditambahkan", update: "diperbarui", delete: "dihapus" }, operation)}`;
};

export function AdminReportList() {
  const [status, setStatus] = useState("draft");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ reports: ReportSummary[]; total: number } | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    api(`/api/admin/reports?status=${status}&page=${page}`).then(value => { if (active) setResult(value); })
      .catch(() => { if (active) setError("Antrean belum dapat dimuat. Periksa sesi dan coba lagi."); });
    return () => { active = false; };
  }, [status, page, refresh]);
  function reload() { setResult(null); setError(""); setRefresh(value => value + 1); }
  return <div className="admin-stack">
    <div className="admin-toolbar"><div className="field"><label className="field-label" htmlFor="report-status">Status tinjauan</label><select id="report-status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); setResult(null); setError(""); }}>{Object.entries(reviewStatuses).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></div><Link className="button primary" href="/admin/new">Buat draft</Link><button className="button subtle" onClick={reload}>Muat ulang</button></div>
    {error ? <p className="alert error" role="alert">{error}</p> : !result ? <p role="status">Memuat antrean…</p> : result.reports.length === 0 ? <div className="card empty-state"><h2>Belum ada laporan</h2><p>Tidak ada laporan dengan status ini.</p></div> : <>
      <div className="admin-report-list">{result.reports.map(report => <Link className="card admin-report-row" key={report.id} href={`/admin/${report.id}`}><div><span className="eyebrow">{label(categories, report.category)}</span><h2>{report.claim}</h2><span className="hint">Diperbarui {timestamp(report.updated_at)}</span></div><div><span>{label(reviewStatuses, report.review_status)}</span><p>{label(verdicts, report.verdict)}</p></div></Link>)}</div>
      <nav className="admin-toolbar" aria-label="Halaman antrean"><button className="button subtle" disabled={page === 1} onClick={() => { setPage(page - 1); setResult(null); }}>Sebelumnya</button><span>Halaman {page} · {result.total} laporan</span><button className="button subtle" disabled={page * 20 >= result.total} onClick={() => { setPage(page + 1); setResult(null); }}>Berikutnya</button></nav>
    </>}
  </div>;
}

type Fields = { claim: string; category: string; verdict: string; summary: string; reasoning: string; adminNotes: string; sources: EditorialSource[] };
const empty: Fields = { claim: "", category: "education", verdict: "unverified", summary: "", reasoning: "", adminNotes: "", sources: [] };
export function AdminReportEditor({ id }: { id?: string }) {
  const router = useRouter();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [fields, setFields] = useState<Fields>(empty);
  const [loaded, setLoaded] = useState(!id);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!id) return;
    let active = true;
    api(`/api/admin/reports/${id}`).then(data => {
      if (!active) return;
      const row: ReportDetail = data.report;
      setReport(row); setAudit(data.audit);
      setFields({ claim: row.claim, category: row.category, verdict: row.verdict, summary: row.summary, reasoning: row.reasoning,
        adminNotes: row.report_private?.admin_notes || "", sources: row.report_sources.filter(source => !source.candidate_key).map(source => ({ url: source.source_url, title: source.source_title, excerpt: source.excerpt || "", publishedAt: source.source_published_at })) });
      setDirty(false); setReviewed(false); setLoaded(true);
    }).catch(() => { if (active) setError("Laporan belum dapat dimuat atau tidak ditemukan. Periksa sesi dan ID laporan."); });
    return () => { active = false; };
  }, [id, refresh]);
  const editable = !report || report.review_status === "draft";
  function change<K extends keyof Fields>(key: K, value: Fields[K]) { setFields(previous => ({ ...previous, [key]: value })); setDirty(true); setReviewed(false); setMessage(""); }
  async function perform(action: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (action === "analyze") {
        const data = await api("/api/admin/reports/analyze", "POST", { text: fields.claim, category: fields.category });
        router.replace(`/admin/${data.report.id}`); return;
      }
      const body = action === "save" ? { ...fields, ...(id ? { expectedUpdatedAt: report?.updated_at } : {}) }
        : { action, expectedUpdatedAt: report?.updated_at, ...(action === "publish" ? { reviewed } : {}) };
      const data = await api(`/api/admin/reports${id ? `/${id}` : ""}`, action === "reject" ? "DELETE" : id ? "PATCH" : "POST", body);
      if (!id) { router.replace(`/admin/${data.report.id}`); return; }
      setLoaded(false); setRefresh(value => value + 1);
      setMessage(action === "save" ? "Draft dan sumber berhasil disimpan." : "Status laporan berhasil diperbarui.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Permintaan gagal. Periksa antrean sebelum mengulangi."); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!loaded) return <div><p role="status">Memuat laporan…</p>{error && <p role="alert" className="alert error">{error}</p>}<button className="button subtle" onClick={() => { setError(""); setRefresh(value => value + 1); }}>Muat ulang</button></div>;
  return <div className="admin-stack">
    {report && <div className="notice">Status: {label(reviewStatuses, report.review_status)} · Diperbarui {timestamp(report.updated_at)}. {editable ? "Perubahan disimpan sebagai draft." : "Kembalikan ke draft sebelum mengedit."}</div>}
    <form className="card form-card" onSubmit={event => { event.preventDefault(); void perform("save"); }}>
      <fieldset className="form-fields" disabled={busy || !editable}>
        <div className="field"><label className="field-label" htmlFor="claim">Klaim yang diperiksa</label><textarea id="claim" rows={4} required minLength={20} maxLength={5000} value={fields.claim} onChange={event => change("claim", event.target.value)} /></div>
        <div className="admin-columns"><div className="field"><label className="field-label" htmlFor="category">Kategori</label><select id="category" value={fields.category} onChange={event => change("category", event.target.value)}>{Object.entries(categories).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></div><div className="field"><label className="field-label" htmlFor="verdict">Hasil tinjauan</label><select id="verdict" disabled={!id} value={fields.verdict} onChange={event => change("verdict", event.target.value)}>{Object.entries(verdicts).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select><p className="hint">Draft baru selalu belum terverifikasi. Valid/hoaks memerlukan bukti sesuai klaim, waktu, lokasi, dan konteks.</p></div></div>
        <div className="field"><label className="field-label" htmlFor="summary">Ringkasan publik</label><textarea id="summary" rows={3} maxLength={3000} value={fields.summary} onChange={event => change("summary", event.target.value)} /></div>
        <div className="field"><label className="field-label" htmlFor="reasoning">Penjelasan dan hubungan bukti</label><textarea id="reasoning" rows={5} maxLength={8000} value={fields.reasoning} onChange={event => change("reasoning", event.target.value)} /></div>
        <div className="field"><label className="field-label" htmlFor="admin-notes">Catatan internal (khusus admin)</label><textarea id="admin-notes" rows={3} maxLength={5000} value={fields.adminNotes} onChange={event => change("adminNotes", event.target.value)} /></div>
        <h2>Sumber editorial</h2><p className="hint">Masukkan sumber asli dan kutipan singkat yang relevan. Menambahkan tautan tidak otomatis membuktikan klaim.</p>
        {fields.sources.map((source, index) => <fieldset className="admin-source" key={index}><legend>Sumber {index + 1}</legend>{([ ["url", "URL sumber"], ["title", "Judul sumber"], ["excerpt", "Kutipan singkat"] ] as const).map(([key, name]) => <div className="field" key={key}><label className="field-label" htmlFor={`source-${index}-${key}`}>{name}</label><input id={`source-${index}-${key}`} type={key === "url" ? "url" : "text"} required={key !== "excerpt"} maxLength={key === "title" ? 1000 : 2000} value={source[key]} onChange={event => change("sources", fields.sources.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item))} /></div>)}<div className="field"><label className="field-label" htmlFor={`source-${index}-date`}>Tanggal terbit (opsional)</label><input id={`source-${index}-date`} type="date" value={source.publishedAt?.slice(0, 10) || ""} onChange={event => change("sources", fields.sources.map((item, i) => i === index ? { ...item, publishedAt: event.target.value ? `${event.target.value}T00:00:00Z` : null } : item))} /></div><button type="button" className="button subtle" onClick={() => change("sources", fields.sources.filter((_, i) => i !== index))}>Hapus sumber {index + 1}</button></fieldset>)}
        <div className="admin-toolbar"><button type="button" className="button subtle" disabled={fields.sources.length >= 20} onClick={() => change("sources", [...fields.sources, { url: "", title: "", excerpt: "", publishedAt: null }])}>Tambah sumber</button><button className="button primary" type="submit">{busy ? "Memproses…" : "Simpan draft"}</button></div>
        {!id && <div className="notice"><p>Opsional: cari referensi dan buat draft dengan bantuan Gemini. Layanan analisis harus diaktifkan pengelola. Hasil otomatis tetap belum terverifikasi; proses ini menggunakan teks klaim dan kategori di atas.</p><button type="button" className="button subtle" disabled={fields.claim.trim().length < 20} onClick={() => void perform("analyze")}>Analisis teks menjadi draft</button></div>}
      </fieldset>
    </form>
    {report && report.report_sources.some(source => source.candidate_key) && <section className="card form-card"><h2>Kandidat referensi hasil pencarian</h2><p className="hint">Metadata ini belum membuktikan kecocokan konteks. Sumber asli tidak diambil otomatis. Provenance dipertahankan saat draft diedit.</p>{report.report_sources.filter(source => source.candidate_key).map(source => <article className="admin-source" key={source.id}><h3>{safeSourceUrl(source.source_url) ? <a className="text-link" href={safeSourceUrl(source.source_url)!} target="_blank" rel="noopener noreferrer">{source.source_title} ↗</a> : source.source_title}</h3><p>{source.matched_claim}</p><p className="hint">{source.publisher} · Tanggal ulasan: {source.review_date ? timestamp(source.review_date) : "Tidak tersedia"}</p></article>)}</section>}
    {report && <section className="card form-card"><h2>Keputusan editorial</h2>{dirty && <p className="notice">Simpan perubahan sebelum mengubah status.</p>}<fieldset className="form-fields" disabled={busy || dirty}>
      {report.review_status === "draft" ? <><label className="admin-review-check"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />Saya telah memeriksa sumber, klaim, waktu, lokasi dan konteks serta menyetujui penjelasan dan hasil laporan ini.</label><div className="admin-toolbar"><button className="button primary" disabled={!reviewed} onClick={() => void perform("publish")}>Setujui dan publikasikan</button><button className="button subtle" onClick={() => void perform("reject")}>Arsipkan draft</button></div><p className="hint">Arsip menyembunyikan laporan dan mempertahankan audit. Laporan dapat dikembalikan ke draft.</p></> : <button className="button subtle" onClick={() => void perform(report.review_status === "published" ? "retract" : "restore")}>{report.review_status === "published" ? "Tarik publikasi ke draft" : "Kembalikan ke draft"}</button>}
    </fieldset></section>}
    {busy && <p role="status">Memproses permintaan…</p>}{error && <p className="alert error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
    {report && <section className="card form-card"><h2>Riwayat perubahan</h2><p className="hint">Menampilkan maksimal 50 aktivitas terbaru. Identitas dan waktu dicatat oleh database.</p><ul className="admin-audit">{audit.map(entry => <li key={entry.id}><strong>{auditLabel(entry.action)}</strong> · {timestamp(entry.happened_at)}<br /><span className="hint">Admin: {entry.actor_id || "Proses sistem"}</span></li>)}</ul></section>}
  </div>;
}
