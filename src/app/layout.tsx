import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "CekFakta — Periksa klaim. Baca bukti.",
  description: "Portal verifikasi klaim pendidikan, politik, dan konservasi alam berbasis sumber dan tinjauan admin.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body><a className="skip-link" href="#main-content">Lewati navigasi</a><SiteHeader /><main id="main-content">{children}</main><footer className="footer"><div className="shell footer-row"><div><strong>CekFakta</strong><p>Periksa klaim. Baca bukti. Ambil keputusan.</p><span>Proyek Kewarganegaraan · Hasil awal memerlukan tinjauan admin.</span></div><div><p>Hindari mengirim data pribadi. Sumber bukti harus dapat ditelusuri.</p><Link className="text-link" href="/admin/login">Login Admin →</Link></div></div></footer></body></html>;
}
