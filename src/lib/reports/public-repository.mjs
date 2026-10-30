import { categories, verdicts, validId, safeSourceUrl } from "./validation.mjs";

export const PUBLIC_PAGE_SIZE = 12;
export class PublicReportsError extends Error {
  constructor(code) { super(code); this.name = "PublicReportsError"; this.code = code; }
}
export function parseReportFilters(params) {
  const allowed = ["q", "category", "verdict", "page"];
  if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) return null;
  const q = (params.get("q") || "").trim();
  const category = params.get("category") || "";
  const verdict = params.get("verdict") || "";
  const rawPage = params.get("page") || "1";
  if (q.length > 150 || /[\u0000-\u001f\u007f*]/.test(q) || (category && !Object.hasOwn(categories, category))
    || (verdict && !Object.hasOwn(verdicts, verdict)) || !/^[1-9]\d{0,3}$/.test(rawPage) || Number(rawPage) > 1000) return null;
  return { q, category, verdict, page: Number(rawPage) };
}
export function reportsHref(filters, page = filters.page) {
  const params = new URLSearchParams();
  for (const key of ["q", "category", "verdict"]) if (filters[key]) params.set(key, filters[key]);
  if (page > 1) params.set("page", String(page));
  return `/reports${params.size ? `?${params}` : ""}`;
}
const COLUMNS = "id,claim,category,verdict,review_status,summary,published_at,updated_at";
const SOURCE_COLUMNS = "id,source_url,source_title,source_domain,excerpt,publisher,source_published_at,review_date,collected_at,evidence_kind,matched_claim";
function reportQuery(client, filters, head = false) {
  let query = client.from("reports").select(head ? "id" : COLUMNS, { count: "exact", head }).eq("review_status", "published");
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.verdict) query = query.eq("verdict", filters.verdict);
  // Literal substring search: SQL LIKE wildcards from user input are escaped.
  if (filters.q) query = query.ilike("claim", `%${filters.q.replace(/[\\%_]/g, value => `\\${value}`)}%`);
  return query;
}
function summary(row) {
  // Fail closed even if a caller accidentally supplies a privileged client/result.
  if (row.review_status !== "published" || !row.published_at) throw new PublicReportsError("unavailable");
  return { id: row.id, claim: row.claim, category: row.category, verdict: row.verdict,
    reviewStatus: "published", summary: row.summary, publishedAt: row.published_at, updatedAt: row.updated_at };
}
export async function listPublicReports(client, filters) {
  try {
    const result = await reportQuery(client, filters).order("published_at", { ascending: false }).order("id", { ascending: false })
      .range((filters.page - 1) * PUBLIC_PAGE_SIZE, filters.page * PUBLIC_PAGE_SIZE - 1).abortSignal(AbortSignal.timeout(5000));
    // PostgREST returns 416 when a previously valid page is beyond the new total.
    // Read a fresh filtered count, rather than treating every service error as empty.
    if (result.status === 416 && result.error?.code === "PGRST103") {
      const count = await reportQuery(client, filters, true).abortSignal(AbortSignal.timeout(5000));
      if (count.error || !Number.isInteger(count.count)) throw new PublicReportsError("unavailable");
      return { reports: [], total: count.count, page: filters.page, pageSize: PUBLIC_PAGE_SIZE };
    }
    if (result.error || !Array.isArray(result.data) || !Number.isInteger(result.count)) throw new PublicReportsError("unavailable");
    return { reports: result.data.map(summary), total: result.count, page: filters.page, pageSize: PUBLIC_PAGE_SIZE };
  } catch { throw new PublicReportsError("unavailable"); }
}
export async function getPublicReport(client, id) {
  if (!validId(id)) return null;
  try {
    const result = await client.from("reports").select(`${COLUMNS},reasoning,report_sources(${SOURCE_COLUMNS})`)
      .eq("review_status", "published").eq("id", id)
      .order("collected_at", { referencedTable: "report_sources", ascending: true })
      .order("id", { referencedTable: "report_sources", ascending: true })
      .limit(100, { referencedTable: "report_sources" }).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
    if (result.error) throw new PublicReportsError("unavailable");
    if (!result.data) return null;
    const row = result.data;
    return { ...summary(row), reason: row.reasoning, sources: (row.report_sources || []).map(source => ({
      id: source.id, url: safeSourceUrl(source.source_url), title: source.source_title,
      publisher: source.publisher || source.source_domain || null, excerpt: source.excerpt,
      publishedAt: source.source_published_at, reviewedAt: source.review_date, collectedAt: source.collected_at,
      kind: source.evidence_kind || "editorial", matchedClaim: source.matched_claim || null,
    })) };
  } catch { throw new PublicReportsError("unavailable"); }
}
