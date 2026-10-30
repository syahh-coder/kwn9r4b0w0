import Link from "next/link";
import { Suspense } from "react";
import { categories, verdicts } from "@/lib/reports/validation.mjs";
import { parseReportFilters, reportsHref } from "@/lib/reports/public-repository.mjs";
import { loadPublicReports, type ReportFilters } from "@/lib/reports/public-server";
import { PublicReportRows, ReportsLoading, ReportsUnavailable } from "@/components/public-reports";

export const dynamic = "force-dynamic";
async function ReportResults({ filters }: { filters: ReportFilters }) {
  let result;
  try { result = await loadPublicReports(filters); } catch { /* Distinguish service errors from successful empty results. */ }
  if (!result) return <ReportsUnavailable href={reportsHref(filters)} />;
  const filtered = Boolean(filters.q || filters.category || filters.verdict);
  return <>
    <p className="hint report-count" role="status">{result.total} laporan sesuai pencarian · Halaman {filters.page}</p>
    {result.reports.length ? <PublicReportRows reports={result.reports} /> : <div className="card empty-state"><h2>{result.total > 0 ? "Tidak ada laporan pada halaman ini" : filtered ? "Tidak ada laporan yang cocok" : "Belum ada laporan yang dipublikasikan"}</h2><p>{result.total > 0 ? "Kembali ke halaman pertama untuk melihat hasil." : filtered ? "Coba kata lain atau hapus filter pencarian." : "Laporan akan muncul setelah ditinjau dan dipublikasikan admin."}</p><Link className="button subtle" href={result.total > 0 ? reportsHref(filters, 1) : filtered ? "/reports" : "/check"}>{result.total > 0 ? "Halaman pertama" : filtered ? "Hapus filter" : "Cek Berita"}</Link></div>}
    <nav className="report-pagination" aria-label="Halaman laporan">{filters.page > 1 && <Link className="button subtle" prefetch={false} href={reportsHref(filters, filters.page - 1)}>← Sebelumnya</Link>}{filters.page * result.pageSize < result.total && filters.page < 1000 && <Link className="button subtle" prefetch={false} href={reportsHref(filters, filters.page + 1)}>Berikutnya →</Link>}</nav>
  </>;
}
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach(item => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  const filters = parseReportFilters(params);
  if (!filters) return <section className="section shell narrow"><h1 className="page-title">Filter laporan tidak valid</h1><p className="lead">Gunakan pencarian maksimal 150 karakter tanpa wildcard *, kategori dan hasil yang tersedia, serta nomor halaman 1–1000.</p><Link className="button subtle" href="/reports">Hapus filter</Link></section>;
  const filtered = Boolean(filters.q || filters.category || filters.verdict);
  return <section className="section shell">
    <div className="eyebrow">Laporan publik</div><h1 className="page-title">Telusuri klaim. Baca buktinya.</h1>
    <p className="lead">Laporan yang telah ditinjau dan dipublikasikan admin, lengkap dengan penjelasan, referensi, dan tanggal. Dipublikasikan tidak selalu berarti klaim dinyatakan valid.</p>
    <form className="card report-filters" action="/reports" method="get">
      <div className="field"><label className="field-label" htmlFor="report-search">Cari klaim</label><input id="report-search" name="q" type="search" maxLength={150} defaultValue={filters.q} placeholder="Kata atau frasa dalam klaim" /></div>
      <div className="field"><label className="field-label" htmlFor="report-category">Kategori</label><select id="report-category" name="category" defaultValue={filters.category}><option value="">Semua kategori</option>{Object.entries(categories).map(([value, title]) => <option value={value} key={value}>{title}</option>)}</select></div>
      <div className="field"><label className="field-label" htmlFor="report-verdict">Hasil pemeriksaan</label><select id="report-verdict" name="verdict" defaultValue={filters.verdict}><option value="">Semua hasil</option>{Object.entries(verdicts).map(([value, title]) => <option value={value} key={value}>{title}</option>)}</select></div>
      <button className="button primary" type="submit">Tampilkan</button>
    </form>
    {filtered && <p className="report-filter-summary">Pencarian: {filters.q || "Semua klaim"} · <Link className="text-link" href="/reports">Hapus filter</Link></p>}
    <Suspense key={reportsHref(filters)} fallback={<ReportsLoading />}><ReportResults filters={filters} /></Suspense>
  </section>;
}
