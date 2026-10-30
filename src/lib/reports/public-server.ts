import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicReport, listPublicReports, PublicReportsError } from "./public-repository.mjs";

// Always anonymous: never read SSR admin cookies for a public page/API.
function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new PublicReportsError("unavailable");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
export type ReportFilters = { q: string; category: string; verdict: string; page: number };
export const loadPublicReports = (filters: ReportFilters) => listPublicReports(publicClient(), filters);
export const loadPublicReport = (id: string) => getPublicReport(publicClient(), id);
