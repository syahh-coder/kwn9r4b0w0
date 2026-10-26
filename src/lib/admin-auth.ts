import "server-only";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase/server";

export async function getAdminAccess() {
  if (!hasSupabaseConfig()) return { status: 503 as const };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error && ((error.status ?? 0) >= 500 || error.name === "AuthRetryableFetchError")) return { status: 503 as const };
    if (error || !data.user) return { status: 401 as const };
    const membership = await supabase.from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle();
    if (membership.error) return { status: 503 as const };
    if (!membership.data) return { status: 403 as const };
    return { status: 200 as const, user: data.user, supabase };
  } catch { return { status: 503 as const }; }
}
