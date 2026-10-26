import { authorize, fail, json, readDocument } from "@/lib/reports/http";
import { categories } from "@/lib/reports/validation.mjs";
import { reviewTextForAdmin } from "@/lib/analysis/server";
import { saveAnalysisDraft } from "@/lib/reports/analysis-draft.mjs";

export async function POST(request: Request) {
  const auth = await authorize(request, true);
  if (auth.response) return auth.response;
  const input = await readDocument(request);
  if (input.response) return input.response;
  const body = input.body as { text?: unknown; category?: unknown } | null;
  if (!body || typeof body !== "object" || Object.keys(body).some(key => !["text", "category"].includes(key))
    || typeof body.text !== "string" || body.text.trim().length < 20 || body.text.length > 5000
    || typeof body.category !== "string" || !Object.hasOwn(categories, body.category)) return fail(400, "invalid_input", "Isi teks 20–5000 karakter dan kategori yang tersedia.");
  try {
    const result = await reviewTextForAdmin(body.text, body.category);
    if (!result.draft) return fail(result.status === "no_factual_claim" ? 422 : 503,
      result.status === "no_factual_claim" ? "no_factual_claim" : "analysis_unavailable",
      result.status === "no_factual_claim" ? "Tidak ditemukan klaim faktual yang dapat diproses." : "Analisis belum tersedia. Periksa flag aktivasi dan akses provider; tidak ada laporan dibuat.");
    const report = await saveAnalysisDraft(auth.access.supabase, result);
    return json({ report }, 201);
  } catch { return fail(503, "service_unavailable", "Analisis atau penyimpanan draft gagal. Periksa antrean sebelum mengulangi."); }
}
