import { NextResponse } from "next/server";
import { getAdminAccess } from "@/lib/admin-auth";

export async function GET() {
  const access = await getAdminAccess();
  const headers = { "Cache-Control": "private, no-store" };
  if (access.status !== 200) return NextResponse.json({ error: { code: access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "service_unavailable", message: access.status === 503 ? "Layanan admin belum tersedia." : "Akses admin diperlukan." } }, { status: access.status, headers });
  return NextResponse.json({ admin: true }, { headers });
}
