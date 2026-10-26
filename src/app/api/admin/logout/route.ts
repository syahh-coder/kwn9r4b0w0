import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/admin-request.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!isSameOrigin(request)) return NextResponse.json({ error: { code: "forbidden", message: "Asal permintaan tidak diizinkan." } }, { status: 403, headers });
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers });
  } catch { return NextResponse.json({ error: { code: "service_unavailable", message: "Logout belum berhasil. Silakan coba lagi." } }, { status: 503, headers }); }
}
