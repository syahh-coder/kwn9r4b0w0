import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminAccess } from "@/lib/admin-auth";
import { AdminReportEditor } from "@/components/admin-reports";

export default async function AdminReportPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getAdminAccess();
  if (access.status === 401) redirect("/admin/login");
  if (access.status !== 200) return <section className="section shell narrow"><h1 className="page-title">Akses admin tidak tersedia</h1><p>Periksa izin akun atau coba lagi nanti.</p></section>;
  const { id } = await params;
  return <section className="section shell narrow"><Link className="text-link" href="/admin">← Antrean laporan</Link><h1 className="page-title">{id === "new" ? "Buat draft laporan" : "Tinjau laporan"}</h1><AdminReportEditor key={id} id={id === "new" ? undefined : id} /></section>;
}
