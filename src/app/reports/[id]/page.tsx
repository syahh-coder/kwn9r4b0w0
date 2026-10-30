import Link from "next/link";
import { notFound } from "next/navigation";
import { validId } from "@/lib/reports/validation.mjs";
import { loadPublicReport } from "@/lib/reports/public-server";
import { reportCategory, ReportDate, ReportsUnavailable, VerdictBadge, type PublicReportDetail } from "@/components/public-reports";

export const dynamic = "force-dynamic";
export default async function ReportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validId(id)) notFound();
  let report: PublicReportDetail | null;
  try { report = await loadPublicReport(id); }
  catch { return <section className="section shell narrow"><Link className="text-link" href="/reports">← Semua laporan</Link><ReportsUnavailable href={`/reports/${id}`} /></section>; }
  if (!report) notFound();
  return <article className="section shell">
    <nav className="report-breadcrumb" aria-label="Jejak halaman"><Link className="text-link" href="/reports">Laporan</Link><span aria-hidden="true"> / </span><Link className="text-link" href={`/reports?category=${report.category}`}>{reportCategory(report.category)}</Link></nav>
    <div className="report-detail-grid"><div className="report-detail-main">
      <VerdictBadge value={report.verdict} /><h1 className="page-title report-claim">{report.claim}</h1>
      <p className="lead report-prose">{report.summary}</p>
      <section className="card form-card"><h2>Penjelasan dan bukti</h2><p className="report-prose">{report.reason}</p></section>
      <section aria-labelledby="sources-heading"><h2 id="sources-heading">Referensi laporan</h2><p className="hint">Baca sumber beserta tanggal dan konteksnya. Metadata ulasan menunjukkan referensi yang ditemukan, bukan bukti kecocokan klaim secara otomatis.</p>
        {report.sources.length ? <ol className="report-sources">{report.sources.map(source => <li className="card form-card" key={source.id}>
          <h3>{source.url ? <a className="text-link" href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span><span className="sr-only"> (tab baru)</span></a> : source.title}</h3>
          {source.url && <p className="report-source-url">{source.url}</p>}
          <p className="hint">Penerbit: {source.publisher || (source.url ? new URL(source.url).hostname : "Tidak tersedia")}</p>
          <dl className="report-source-dates"><div><dt>Tanggal terbit</dt><dd><ReportDate value={source.publishedAt} /></dd></div>{source.reviewedAt && <div><dt>Tanggal ulasan</dt><dd><ReportDate value={source.reviewedAt} /></dd></div>}<div><dt>Referensi dicatat</dt><dd><ReportDate value={source.collectedAt} /></dd></div></dl>
          {source.excerpt && <blockquote className="report-prose">{source.excerpt}</blockquote>}
          {source.matchedClaim && <div className="report-reference-claim"><span className="field-label">{source.kind === "claim_review_metadata" ? "Klaim yang dibahas referensi" : "Klaim yang dibandingkan"}</span><p className="report-prose">{source.matchedClaim}</p></div>}
          {source.kind === "claim_review_metadata" && <p className="hint">Kandidat metadata ClaimReview; isi artikel tidak diambil otomatis.</p>}
          {source.kind === "web_source_content" && <p className="hint">{source.excerpt ? "Kutipan dicocokkan dengan teks sumber yang tersedia saat pemeriksaan." : "Teks sumber dibaca saat pemeriksaan; belum ada kutipan yang dipilih model."} Kecocokan konteks tetap ditinjau admin.</p>}
          {source.kind === "web_search_metadata" && <p className="hint">Tautan hasil pencarian; isi sumber belum berhasil dibaca.</p>}
        </li>)}</ol> : <p className="notice">Referensi belum tersedia pada laporan ini. Jangan menyimpulkan klaim benar hanya dari status publikasi.</p>}
      </section>
    </div><aside className="card form-card report-detail-aside"><div className="eyebrow">Status editorial</div><h2>Ditinjau admin</h2><p>Laporan ini telah disetujui untuk dipublikasikan.</p><dl className="report-metadata"><div><dt>Kategori</dt><dd>{reportCategory(report.category)}</dd></div><div><dt>Dipublikasikan</dt><dd><ReportDate value={report.publishedAt} /></dd></div><div><dt>Diperbarui</dt><dd><ReportDate value={report.updatedAt} /></dd></div></dl><h3>Tentang hasil ini</h3><p className="hint">Kesimpulan berlaku pada klaim dan konteks yang diperiksa. “Belum dapat diverifikasi” berarti bukti belum memadai; bukan pernyataan bahwa klaim benar atau salah.</p></aside></div>
  </article>;
}
