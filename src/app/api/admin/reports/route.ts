import { authorize, databaseFailure, fail, json, readDocument } from "@/lib/reports/http";
import { reviewStatuses, validateDraft } from "@/lib/reports/validation.mjs";

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  const params = new URL(request.url).searchParams;
  const status = params.get("status") || "draft";
  const page = Number(params.get("page") || "1");
  if (!Object.hasOwn(reviewStatuses, status) || !Number.isInteger(page) || page < 1 || page > 10000) return fail(400, "invalid_input", "Filter atau halaman tidak valid.");
  try {
    const result = await auth.access.supabase.from("reports").select("id,claim,category,verdict,review_status,updated_at", { count: "exact" })
      .eq("review_status", status).order("updated_at", { ascending: false }).order("id").range((page - 1) * 20, page * 20 - 1);
    return result.error ? databaseFailure(result.error) : json({ reports: result.data, total: result.count, page, pageSize: 20 });
  } catch { return fail(503, "service_unavailable", "Daftar laporan belum dapat dimuat."); }
}

export async function POST(request: Request) {
  const auth = await authorize(request, true);
  if (auth.response) return auth.response;
  const input = await readDocument(request);
  if (input.response) return input.response;
  const document = validateDraft(input.body, true);
  if (!document) return fail(400, "invalid_input", "Periksa klaim, kategori, dan sumber. Laporan baru wajib belum terverifikasi.");
  try {
    const result = await auth.access.supabase.rpc("save_report_draft", { p_id: null, p_expected: null, p_document: document });
    return result.error ? databaseFailure(result.error) : json({ report: result.data }, 201);
  } catch { return fail(503, "service_unavailable", "Draft belum dapat disimpan."); }
}
