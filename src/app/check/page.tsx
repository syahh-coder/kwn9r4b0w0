import { CheckForm } from "@/components/check-form";

export default function CheckPage() {
  return <section className="section shell narrow">
    <div className="eyebrow">Cek Berita</div><h1 className="page-title">Mulai dari sebuah klaim.</h1>
    <p className="lead">Masukkan tautan atau teks berita tentang pendidikan, politik, atau konservasi alam. Sertakan waktu dan konteks agar klaim dapat ditelusuri.</p>
    <CheckForm />
    <aside className="input-guidance"><h2>Sebelum mengirim</h2><p>Jangan sertakan data pribadi atau informasi rahasia. Penilaian AI adalah bantuan analisis, bukan keputusan final. Laporan publik harus melalui tinjauan admin.</p></aside>
  </section>;
}
