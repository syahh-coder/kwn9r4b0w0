// Opt-in probe: at most one provider request; no article fetch, Gemini or DB write.
import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { createFactCheckSearch } from "../src/lib/evidence/google-fact-check.mjs";
import { sourcePayload } from "../src/lib/evidence/source-repository.mjs";

nextEnv.loadEnvConfig(process.cwd());
const apiKey = process.env.GOOGLE_FACTCHECK_API_KEY;
const enabled = process.env.FACTCHECK_SEARCH_ENABLED === "true";
let requests = 0;
let httpStatus = null;
const search = createFactCheckSearch({
  apiKey, enabled,
  fetchImpl: async (url, options) => {
    if (++requests > 1) throw new Error("request_budget_exceeded");
    const response = await fetch(url, options);
    httpStatus = response.status;
    return response;
  },
});

try {
  // Search terms only: this phrase is not an assertion or a factual verdict.
  const query = "klaim ijazah palsu Jokowi";
  const result = await search(query);
  console.log(JSON.stringify({ status: result.status, httpStatus, candidateCount: result.candidates.length }));
  assert.ok(["available", "no_candidates"].includes(result.status));
  assert.equal(requests, 1);
  assert.deepEqual(await search(query), result);
  assert.equal(requests, 1, "Replay harus memakai cache tanpa request tambahan");
  const payload = sourcePayload(result.candidates);
  assert.equal(payload.length, result.candidates.length);
  assert.ok(result.candidates.every(candidate => candidate.contextVerified === false && !("verdict" in candidate)));
  console.log(JSON.stringify({ samples: result.candidates.slice(0, 2).map(({ url, publisher, reviewDate }) => ({ url, publisher, reviewDate })) }));
  console.log("PASS: akses provider, normalisasi, payload provenance dan replay cache. Tidak menyimpan report atau menentukan verdict.");
  if (!result.candidates.length) console.log("Pencarian kosong: provenance live belum dapat diuji dengan kandidat nyata.");
} catch {
  console.error("FAIL: probe Fact Check belum lulus. Periksa status terbatas di atas; key dan respons mentah tidak dicetak.");
  process.exitCode = 1;
} finally {
  console.log(`Request provider: ${requests}; tanpa retry, perubahan environment, billing atau database.`);
}
