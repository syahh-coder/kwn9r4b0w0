import Link from "next/link";
import { categories, verdicts } from "@/lib/reports/validation.mjs";
import { loadPublicReports } from "@/lib/reports/public-server";

export type PublicReportSummary = { id: string; claim: string; category: string; verdict: string; reviewStatus: string; summary: string; publishedAt: string; updatedAt: string };
export type PublicReportSource = { id: string; url: string | null; title: string; publisher: string | null; excerpt: string | null; publishedAt: string | null; reviewedAt: string | null; collectedAt: string; kind: string; matchedClaim: string | null };
export type PublicReportDetail = PublicReportSummary & { reason: string; sources: PublicReportSource[] };
export const reportCategory = (value: string) => categories[value as keyof typeof categories] || "Kategori tidak tersedia";
export function ReportDate({ value }: { value: string | null }) {
  if (!value || !Number.isFinite(Date.parse(value))) return <span>Tidak tersedia</span>;
  return <time dateTime={value}>{new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(value))}</time>;
}
export function VerdictBadge({ value }: { value: string }) {
  const kind = value === "valid" ? "valid" : value === "hoax" ? "hoax" : "unverified";
  return <span className={`badge verdict-${kind}`}><span aria-hidden="true">{kind === "valid" ? "✓" : kind === "hoax" ? "×" : "?"}</span>{verdicts[kind]}</span>;
}
export function PublicReportRows({ reports }: { reports: PublicReportSummary[] }) {
  return <div className="public-report-list">{reports.map(report => <article className="card public-report-row" key={report.id}>
    <div><span className="eyebrow">{reportCategory(report.category)}</span><h2><Link className="report-title-link" prefetch={false} href={`/reports/${report.id}`}>{report.claim}</Link></h2><p className="report-excerpt">{report.summary}</p></div>
    <div className="public-report-meta"><VerdictBadge value={report.verdict} /><p className="hint">Ditinjau admin · Dipublikasikan<br /><ReportDate value={report.publishedAt} /></p><Link className="text-link" prefetch={false} href={`/reports/${report.id}`}>Baca laporan <span aria-hidden="true">→</span><span className="sr-only">: {report.claim}</span></Link></div>
  </article>)}</div>;
}
export function ReportsUnavailable({ href = "/reports" }: { href?: string }) {
  return <div className="card empty-state" role="alert"><h2>Laporan belum dapat dimuat</h2><p>Koneksi ke layanan laporan belum tersedia. Silakan coba lagi nanti.</p><a className="button subtle" href={href}>Coba lagi</a></div>;
}
export function ReportsLoading() {
  return <div className="card empty-state" role="status" aria-busy="true"><p>Memuat laporan yang sudah ditinjau admin…</p></div>;
}
export async function RecentReports() {
  let result;
  try {
    result = await loadPublicReports({ q: "", category: "", verdict: "", page: 1 });
  } catch { return <ReportsUnavailable href="/" />; }
  return result.reports.length ? <PublicReportRows reports={result.reports.slice(0, 3)} /> : <div className="card empty-state"><h3>Belum ada laporan yang dipublikasikan.</h3><p>Laporan akan muncul setelah ditinjau dan dipublikasikan admin.</p></div>;
}
