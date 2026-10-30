import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { parseCheckInput } from "./check-input.mjs";
import { parseArticleUrl } from "./ingestion/url-policy.mjs";
import { buildAnalysisDocument } from "./reports/analysis-draft.mjs";

export class CheckError extends Error {
  constructor(code, status = 503, retryAfter = 0) { super(code); this.name = "CheckError"; this.code = code; this.status = status; this.retryAfter = retryAfter; }
}
export const checkMessages = {
  service_unavailable: "Pemeriksaan belum tersedia. Silakan coba lagi nanti.",
  rate_limited: "Terlalu banyak permintaan. Tunggu sebelum mencoba lagi.",
  budget_exhausted: "Batas pemeriksaan aplikasi sementara tercapai. Coba lagi nanti.",
  processing: "Permintaan serupa sedang diproses. Coba lagi sebentar; belum ada hasil baru.",
  busy: "Layanan sedang memproses permintaan lain. Coba lagi sebentar.",
  invalid_input: "Periksa kembali teks, tautan, dan kategori berita.",
  url_disabled: "Pemeriksaan tautan belum diaktifkan. Salin teks klaim dan gunakan pilihan Teks berita.",
  fetch_blocked: "Tautan ditolak oleh kebijakan keamanan. Gunakan artikel publik atau masukkan teks klaim.",
  source_unavailable: "Isi artikel belum dapat diambil. Gunakan teks klaim atau artikel lain.",
  no_factual_claim: "Tidak ditemukan klaim faktual yang dapat diproses. Tambahkan klaim yang jelas beserta konteksnya.",
  analysis_unavailable: "Analisis belum berhasil. Tidak ada laporan baru yang dibuat. Coba lagi nanti.",
  web_search_unavailable: "Pencarian sumber web belum tersedia atau batasnya tercapai. Tidak ada laporan baru yang dibuat; coba lagi nanti.",
};
export function requestSubject(headers, trustedHeader = "") {
  // Never trust arbitrary X-Forwarded-For. Without an operator-configured proxy
  // header, all unknown callers share one conservative bucket, not a spoofed IP.
  if (!/^[a-z0-9-]{1,64}$/.test(trustedHeader)) return "unknown-client";
  const value = headers.get(trustedHeader)?.trim();
  return value && isIP(value) ? value : "unknown-client";
}
export function checkHashes(input, subject, secret, model, now = new Date(), policy = "check-v1") {
  if (typeof secret !== "string" || secret.length < 32) throw new CheckError("service_unavailable");
  const hash = value => createHmac("sha256", secret).update(value).digest("hex");
  return { key: hash(JSON.stringify([policy, model, input.inputType, input.category, input.input])), subject: hash(`subject:${now.toISOString().slice(0, 10)}:${subject}`) };
}
function failure(result) {
  if (result?.status === "no_factual_claim") return new CheckError("no_factual_claim", 422);
  if (result?.status === "web_search_unavailable") return new CheckError("web_search_unavailable");
  return new CheckError("analysis_unavailable");
}

/** All external effects follow a shared DB reservation. No public write client.
 * URL retrieval uses only the reviewed safe-fetch module supplied by the server.
 */
export function createCheckService({ client, review, retrieveArticle, secret, model, scope = "public-v1", enabled = false, urlEnabled = false, policy = "check-v1" }) {
  return async function check(payload, subject) {
    const parsed = parseCheckInput(payload);
    if (!parsed.ok) throw new CheckError("invalid_input", 400);
    if (!enabled || !client || typeof review !== "function") throw new CheckError("service_unavailable");
    const input = parsed.value;
    if (input.inputType === "url") {
      if (!urlEnabled) throw new CheckError("url_disabled", 422);
      try { input.input = parseArticleUrl(input.input).href; } catch { throw new CheckError("fetch_blocked", 422); }
    }
    const hashes = checkHashes(input, subject, secret, model, new Date(), policy);
    let reservation;
    try {
      const { data, error } = await client.rpc("reserve_check", { p_scope: scope, p_key: hashes.key, p_subject: hashes.subject, p_url: input.inputType === "url" });
      if (error || !data?.status) throw new CheckError("service_unavailable");
      reservation = data;
    } catch { throw new CheckError("service_unavailable"); }
    if (reservation.status === "cached") return { ...reservation.preview, cached: true };
    if (reservation.status !== "reserved") {
      const statuses = { processing: 409, busy: 429, rate_limited: 429, budget_exhausted: 429 };
      if (!Object.hasOwn(statuses, reservation.status)) throw new CheckError("service_unavailable");
      throw new CheckError(reservation.status, statuses[reservation.status], reservation.retryAfter);
    }
    try {
      let text = input.input;
      let submittedUrl = null;
      let truncated = false;
      if (input.inputType === "url") {
        let article;
        try { article = await retrieveArticle(input.input); }
        catch (error) { throw new CheckError(error?.code === "fetch_blocked" ? "fetch_blocked" : "source_unavailable", 422); }
        text = article.text;
        truncated = article.truncated;
        // URL query values can contain tracking/access tokens. They are not a
        // factual citation and are not persisted as a public report field.
        const finalUrl = new URL(article.sourceUrl);
        submittedUrl = `${finalUrl.origin}${finalUrl.pathname}`;
      }
      const result = await review({ text, category: input.category }, { reserveWebSearch: async () => {
        const { data, error } = await client.rpc("reserve_web_search", { p_scope: scope, p_key: hashes.key, p_token: reservation.token });
        return !error && data === true;
      } });
      if (!result?.draft) throw failure(result);
      const document = buildAnalysisDocument(result);
      const limitations = [...result.draft.limitations];
      if (truncated) limitations.push("Teks artikel dipotong sesuai batas ukuran; bagian setelah batas belum dianalisis.");
      const { data, error } = await client.rpc("complete_check", { p_scope: scope, p_key: hashes.key, p_token: reservation.token,
        p_document: { ...document, adminNotes: limitations.join("\n"), limitations }, p_input_type: input.inputType, p_url: submittedUrl, p_analysis: result.analysisAvailable === true });
      if (error || data?.mode !== "analysis" || data.verdict !== "unverified" || data.reviewStatus !== "draft") throw new CheckError("service_unavailable");
      return { ...data, cached: false };
    } catch (error) {
      // Release only this lease. A delayed request cannot cancel a newer worker.
      try { await client.rpc("fail_check", { p_scope: scope, p_key: hashes.key, p_token: reservation.token }); } catch { /* Bounded lease expires if DB unavailable. */ }
      if (error instanceof CheckError) throw error;
      throw new CheckError("analysis_unavailable");
    }
  };
}
