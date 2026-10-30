export type EditorialSource = { url: string; title: string; excerpt: string; publishedAt: string | null };
export type ReportSource = { id: string; source_url: string; source_title: string; excerpt: string | null; source_published_at: string | null; candidate_key: string | null; publisher: string | null; matched_claim: string | null; review_date: string | null; evidence_kind: string | null };
export type ReportSummary = { id: string; claim: string; category: string; verdict: string; review_status: string; updated_at: string };
export type ReportDetail = ReportSummary & { summary: string; reasoning: string; report_sources: ReportSource[]; report_private: { admin_notes: string | null } | null };
export type AuditEntry = { id: string; action: string; happened_at: string; actor_id: string | null };
