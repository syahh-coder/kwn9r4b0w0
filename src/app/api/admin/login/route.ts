import { NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/admin-request.mjs";
import { JsonInputError, readBoundedJson } from "@/lib/bounded-json.mjs";

const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "forbidden", "Asal permintaan tidak diizinkan.");
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return fail(415, "invalid_input", "Gunakan format JSON.");
  if (!hasSupabaseConfig()) return fail(503, "service_unavailable", "Login admin belum dikonfigurasi.");
  let body;
  try {
    body = await readBoundedJson(request, { maxBytes: 4096, timeoutMs: 5000 });
  } catch (error) {
    if (error instanceof JsonInputError && error.code === "payload_too_large") return fail(413, "invalid_input", "Data login terlalu besar.");
    if (error instanceof JsonInputError && error.code === "request_timeout") return fail(408, "request_timeout", "Waktu pengiriman login habis.");
    return fail(400, "invalid_input", "Data login tidak valid.");
  }
  if (!body || typeof body.email !== "string" || typeof body.password !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || body.email.length > 254 || body.password.length < 1 || body.password.length > 1024) return fail(400, "invalid_input", "Isi email dan kata sandi yang valid.");
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: body.email.trim(), password: body.password });
    if (error && ((error.status ?? 0) >= 500 || error.name === "AuthRetryableFetchError")) return fail(503, "service_unavailable", "Layanan login belum dapat dihubungi.");
    if (error || !data.user) return fail(error?.status === 429 ? 429 : 401, error?.status === 429 ? "rate_limited" : "unauthorized", error?.status === 429 ? "Terlalu banyak percobaan. Coba lagi nanti." : "Email atau kata sandi tidak sesuai.");
    const membership = await supabase.from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle();
    if (membership.error || !membership.data) {
      await supabase.auth.signOut({ scope: "local" });
      return membership.error ? fail(503, "service_unavailable", "Akses admin belum dapat diperiksa.") : fail(403, "forbidden", "Akun ini tidak memiliki akses admin.");
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail(503, "service_unavailable", "Layanan login belum dapat dihubungi."); }
}
