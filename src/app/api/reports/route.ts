import { NextResponse } from "next/server";
import { parseReportFilters } from "@/lib/reports/public-repository.mjs";
import { loadPublicReports } from "@/lib/reports/public-server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const filters = parseReportFilters(new URL(request.url).searchParams);
  if (!filters) return NextResponse.json({ error: { code: "invalid_input", message: "Pencarian, filter, atau halaman tidak valid." } }, { status: 400, headers });
  try { return NextResponse.json(await loadPublicReports(filters), { headers }); }
  catch { return NextResponse.json({ error: { code: "service_unavailable", message: "Laporan belum dapat dimuat. Coba lagi nanti." } }, { status: 503, headers }); }
}
