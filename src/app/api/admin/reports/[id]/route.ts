import { authorize, databaseFailure, fail, json, readDocument } from "@/lib/reports/http";
import { validId, validateAction, validateDraft } from "@/lib/reports/validation.mjs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  const { id } = await context.params;
  if (!validId(id)) return fail(400, "invalid_input", "ID laporan tidak valid.");
  try {
    const [report, audit] = await Promise.all([
      auth.access.supabase.from("reports").select("*,report_sources(*),report_private(admin_notes)").eq("id", id).maybeSingle(),
      auth.access.supabase.from("report_audit").select("id,action,happened_at,actor_id").eq("report_id", id).order("happened_at", { ascending: false }).limit(50),
    ]);
    if (report.error || audit.error) return databaseFailure(report.error || audit.error!);
    return report.data ? json({ report: report.data, audit: audit.data }) : fail(404, "not_found", "Laporan tidak ditemukan.");
  } catch { return fail(503, "service_unavailable", "Laporan belum dapat dimuat."); }
}

async function mutate(request: Request, context: Context, deleting: boolean) {
  const auth = await authorize(request, true);
  if (auth.response) return auth.response;
  const { id } = await context.params;
  if (!validId(id)) return fail(400, "invalid_input", "ID laporan tidak valid.");
  const input = await readDocument(request);
  if (input.response) return input.response;
  const action = validateAction(input.body);
  if (deleting && action?.action !== "reject") return fail(400, "invalid_input", "Penghapusan memakai aksi reject pada draft (arsip).");
  const document = !deleting && !action ? validateDraft(input.body) : null;
  if (!action && !document) return fail(400, "invalid_input", "Data atau persetujuan review tidak valid.");
  try {
    const result = action
      ? await auth.access.supabase.rpc("admin_report_action", { p_id: id, p_expected: action.expectedUpdatedAt, p_action: action.action, p_reviewed: action.reviewed })
      : await auth.access.supabase.rpc("save_report_draft", { p_id: id, p_expected: (input.body as { expectedUpdatedAt: string }).expectedUpdatedAt, p_document: document });
    return result.error ? databaseFailure(result.error) : json({ report: result.data });
  } catch { return fail(503, "service_unavailable", "Perubahan belum dapat disimpan."); }
}
export const PATCH = (request: Request, context: Context) => mutate(request, context, false);
export const DELETE = (request: Request, context: Context) => mutate(request, context, true);
