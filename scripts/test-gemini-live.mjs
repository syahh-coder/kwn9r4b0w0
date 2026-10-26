// Explicit live integration probe: up to three bounded calls, fictional fixtures only.
// No web search, URL retrieval, database writes, or application activation.
import nextEnv from "@next/env";
import { GoogleGenAI } from "@google/genai";
import { createClaimExtractor } from "../src/lib/analysis/claim-extraction.mjs";
import { createEvidenceAnalyzer } from "../src/lib/analysis/evidence-analysis.mjs";
import { normalizeFactCheckResponse } from "../src/lib/evidence/google-fact-check.mjs";
import { createEvidenceComparator } from "../src/lib/analysis/evidence-comparison.mjs";

nextEnv.loadEnvConfig(process.cwd());
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL;
if (!apiKey || !model || !/^[a-zA-Z0-9._-]{1,100}$/.test(model)) {
  console.error("Konfigurasi Gemini belum lengkap."); process.exit(1);
}
let calls = 0;
const client = new GoogleGenAI({ apiKey, vertexai: false, httpOptions: { timeout: 15000, retryOptions: { attempts: 1 } } });
const generate = async request => {
  calls++;
  try { const response = await client.models.generateContent(request); return { text: response.text }; }
  catch (error) {
    // Print bounded diagnostic labels only, never the API response or request data.
    const status = Number.isInteger(error?.status) ? error.status : "network_error";
    const message = typeof error?.message === "string" ? error.message : "";
    const hint = /API_KEY_INVALID/.test(message) ? "api_key_invalid"
      : /response.?json.?schema|any_of|anyOf|schema/i.test(message) ? "schema_rejected"
      : /not found|not supported|not available/i.test(message) ? "model_or_method_unavailable" : "request_rejected";
    console.error(`Diagnostik terbatas: ${status}, ${hint}.`);
    throw error;
  }
};
const options = { enabled: true, apiKey, model, generate };
// FICTIONAL: these statements and example.org URLs are not ground truth.
const text = "Pada 12 Juni 2025, Sekolah Fiktif Nusantara membuka perpustakaan di Kota Contoh.";
try {
  const extraction = await createClaimExtractor(options)({ text, category: "education" });
  if (extraction.status !== "extracted") {
    console.error(`Uji ekstraksi live belum lulus (${extraction.status}).`); process.exitCode = 1;
  } else {
    const sources = normalizeFactCheckResponse({ claims: [{ text: extraction.claim.text, claimReview: [{
      url: "https://example.org/fictional-live-fixture", title: "Fixture fiktif untuk uji SDK", publisher: { name: "Penerbit Fiktif Pengujian" },
    }] }] }, new Date().toISOString());
    const analysis = await createEvidenceAnalyzer(options)({ claim: extraction.claim.text, category: "education", evidenceStatus: "available", sources });
    if (analysis.status !== "draft_ready" || analysis.draft?.verdict !== "unverified" || analysis.draft?.reviewStatus !== "draft") {
      console.error(`Uji analisis live belum lulus (${analysis.status}).`); process.exitCode = 1;
    } else {
      const comparison = await createEvidenceComparator(options)({ claim: extraction.claim.text, category: "education", sources, documents: [{
        evidenceId: sources[0].id, sourceUrl: sources[0].url, text, retrievedAt: new Date().toISOString(),
      }] });
      if (comparison.status !== "compared") { console.error(`Uji perbandingan live belum lulus (${comparison.status}).`); process.exitCode = 1; }
      else console.log("Uji live lulus: ekstraksi verbatim, schema/citation allowlist, perbandingan isi dengan kutipan terverifikasi, dan final unverified/draft. Fixture fiktif, bukan evaluasi kebenaran berita.");
    }
  }
} catch { console.error("Uji live gagal; respons mentah dan key tidak dicetak."); process.exitCode = 1; }
finally { console.log(`Request generasi pada probe ini: ${calls}. Tidak menyimpan report atau mengaktifkan pipeline publik.`); }
