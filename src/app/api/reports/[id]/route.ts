import { NextResponse } from "next/server";
import { loadPublicReport } from "@/lib/reports/public-server";
import { validId } from "@/lib/reports/validation.mjs";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const { id } = await params;
  const missing = () => NextResponse.json({ error: { code: "not_found", message: "Laporan tidak ditemukan atau belum dipublikasikan." } }, { status: 404, headers });
  if (!validId(id)) return missing();
  try {
    const report = await loadPublicReport(id);
    return report ? NextResponse.json({ report }, { headers }) : missing();
  } catch { return NextResponse.json({ error: { code: "service_unavailable", message: "Laporan belum dapat dimuat. Coba lagi nanti." } }, { status: 503, headers }); }
}
