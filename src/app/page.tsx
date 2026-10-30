import Link from "next/link";
import { CheckForm } from "@/components/check-form";
import { HeroAtmosphere } from "@/components/hero-atmosphere";
import { Suspense } from "react";
import { RecentReports, ReportsLoading } from "@/components/public-reports";

export const dynamic = "force-dynamic";

const categories = [
  { title: "Pendidikan", info: "Beasiswa, kebijakan sekolah, dan akses pendidikan." },
  { title: "Politik", info: "Pernyataan publik dan kebijakan dalam konteksnya." },
  { title: "Konservasi Alam", info: "Lingkungan, satwa, dan pelestarian ekosistem." },
];

export default function Home() {
  return <>
    <div className="hero-stage">
    <HeroAtmosphere />
    <section className="hero shell">
      <div className="eyebrow"><span className="dot" /> Verifikasi informasi publik</div>
      <h1>Jangan hanya baca beritanya.<br /><em>Periksa faktanya.</em></h1>
      <p className="hero-text">Periksa klaim tentang pendidikan, politik, dan konservasi alam berdasarkan sumber yang dapat ditelusuri.</p>
      <div className="hero-workspace"><CheckForm /><aside className="workflow card"><span className="eyebrow">Bukti jadi dasar</span><h2>Kesimpulan perlu sumber.</h2><p>Alur pemeriksaan dari klaim hingga tinjauan admin.</p><ol><li>Masukkan klaim</li><li>Cari sumber pembanding</li><li>Analisis kecocokan bukti</li><li>Tinjauan laporan oleh admin</li></ol><p className="hint">Tanpa bukti yang cukup, klaim tetap belum dapat diverifikasi.</p></aside></div>
      <p className="editorial-note">Hasil AI bersifat bantuan analisis, bukan keputusan final. Laporan publik ditinjau admin.</p>
    </section>
    </div>
    <section className="section alt"><div className="shell"><div className="section-head section-heading-row"><div><div className="eyebrow">Telusuri bukti</div><h2>Laporan terbaru</h2></div><Link className="text-link" href="/reports">Semua laporan <span aria-hidden="true">→</span></Link></div>
      <Suspense fallback={<ReportsLoading />}><RecentReports /></Suspense>
    </div></section>
    <section className="section shell"><div className="section-head"><div className="eyebrow">Tiga bidang fokus</div><h2>Informasi dekat dengan kita.</h2></div><div className="card-grid">{categories.map((category, index) => <article className="card topic-card" key={category.title}><span className="topic-index">0{index + 1}</span><h3>{category.title}</h3><p>{category.info}</p></article>)}</div></section>
    <section id="cara-kerja" className="section shell"><div className="section-head"><div className="eyebrow">Cara kerja</div><h2>Dari klaim ke laporan transparan.</h2><p>Verifikasi menilai klaim yang spesifik, termasuk waktu, lokasi, dan konteksnya.</p></div><div className="steps">
      <article className="step"><span>01 / MASUKAN</span><h3>Berikan konteks</h3><p>Kirim teks atau tautan. Validasi format masukan sudah tersedia tanpa login.</p></article>
      <article className="step"><span>02 / BUKTI</span><h3>Telusuri referensi</h3><p>Sistem mencari kandidat referensi dan membantu analisis klaim. Metadata saja belum membuktikan kecocokan waktu, lokasi, dan konteks.</p></article>
      <article className="step"><span>03 / TINJAUAN</span><h3>Periksa sebelum publikasi</h3><p>Admin meninjau bukti dan penjelasan sebelum menyetujui publikasi. Laporan yang disetujui dapat ditelusuri tanpa login.</p></article>
    </div></section>
  </>;
}
