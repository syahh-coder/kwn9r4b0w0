import Link from "next/link";
export default function NotFound() {
  return <section className="section shell narrow"><h1 className="page-title">Halaman tidak ditemukan</h1><p className="lead">Halaman tidak ada atau belum dipublikasikan.</p><Link href="/" className="button primary">Beranda</Link></section>;
}
