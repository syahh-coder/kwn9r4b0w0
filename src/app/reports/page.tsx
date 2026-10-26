import Link from "next/link";
export default function ReportsPage() {
  return <section className="section shell narrow">
    <div className="eyebrow">Fitur 02 · Report publik</div><h1 className="page-title">Laporan verifikasi</h1>
    <p className="lead">Laporan di halaman ini nantinya hanya menampilkan hasil yang sudah disetujui admin, lengkap dengan sumber dan tanggal.</p>
    <div className="card empty-state"><div className="empty-symbol" aria-hidden="true">◫</div><h2>Belum ada report yang dipublikasikan</h2>
      <p>Database, verifikasi sumber dan fitur moderasi sedang dikembangkan. Tidak ada contoh fiktif yang ditampilkan sebagai fakta.</p>
      <Link href="/check" className="button subtle">Kembali ke Cek Berita</Link>
    </div>
  </section>;
}
