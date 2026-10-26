"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <header className="site-header"><div className="shell nav">
    <Link href="/" className="brand" aria-label="CekFakta, kembali ke beranda" onClick={() => setOpen(false)}><span className="brandmark" aria-hidden="true">✓</span>Cek<span>Fakta</span></Link>
    <button className="menu-toggle button subtle" type="button" aria-controls="main-nav" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Tutup" : "Menu"}</button>
    <nav id="main-nav" aria-label="Navigasi utama" className={`nav-links${open ? " is-open" : ""}`}>
      <Link href="/check" aria-current={pathname === "/check" ? "page" : undefined} onClick={() => setOpen(false)}>Cek Berita</Link>
      <Link href="/reports" aria-current={pathname.startsWith("/reports") ? "page" : undefined} onClick={() => setOpen(false)}>Laporan</Link>
      <Link href="/#cara-kerja" onClick={() => setOpen(false)}>Cara Kerja</Link>
    </nav>
  </div></header>;
}
