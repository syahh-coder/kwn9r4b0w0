import { redirect } from "next/navigation";
import { getAdminAccess } from "@/lib/admin-auth";
import { hasSupabaseConfig } from "@/lib/supabase/server";
import { AdminLoginForm } from "@/components/admin-login-form";

export default async function AdminLoginPage() {
  const access = await getAdminAccess();
  if (access.status === 200) redirect("/admin");
  return <section className="section shell login-panel"><div className="eyebrow">Akses khusus</div><h1 className="page-title">Login Admin</h1><p className="lead">Masuk untuk mengakses ruang tinjauan editorial CekFakta.</p>
    {!hasSupabaseConfig() ? <div className="notice" role="status">Login admin belum dikonfigurasi. Hubungi pengelola.</div> : <AdminLoginForm />}
  </section>;
}
