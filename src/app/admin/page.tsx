import { redirect } from "next/navigation";
import { getAdminAccess } from "@/lib/admin-auth";
import { AdminLogoutButton } from "@/components/admin-login-form";
import { AdminReportList } from "@/components/admin-reports";

export default async function AdminPage() {
  const access = await getAdminAccess();
  if (access.status === 401) redirect("/admin/login");
  if (access.status !== 200) return <section className="section shell narrow"><h1 className="page-title">{access.status === 403 ? "Akses tidak diizinkan" : "Layanan admin belum tersedia"}</h1><p className="lead">{access.status === 403 ? "Akun ini belum mendapat izin admin dari pengelola." : "Akses admin belum dapat diperiksa. Silakan coba lagi nanti."}</p><AdminLogoutButton /></section>;
  return <section className="section shell"><div className="section-heading-row"><div><div className="eyebrow">Ruang editorial</div><h1 className="page-title">Dashboard Admin</h1></div><AdminLogoutButton /></div><p className="lead">Anda masuk sebagai {access.user.email}. Tinjau bukti sebelum menerbitkan laporan.</p><AdminReportList /></section>;
}
