import { authorize, fail, json, readDocument } from "@/lib/reports/http";
import { categories } from "@/lib/reports/validation.mjs";
import { checkAdminRequest } from "@/lib/check-server";
import { CheckError, checkMessages } from "@/lib/check-service.mjs";
export const maxDuration = 90;

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
    const result = await checkAdminRequest({ inputType: "text", input: body.text, category: body.category }, auth.access.user.id);
    return json({ report: { id: result.id } }, 201);
  } catch (error) {
    const code = error instanceof CheckError ? error.code : "service_unavailable";
    return fail(error instanceof CheckError ? error.status : 503, code, checkMessages[code as keyof typeof checkMessages] || checkMessages.service_unavailable);
  }
}
