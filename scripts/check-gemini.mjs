// Metadata-only readiness check. Never generates content or prints credentials.
import nextEnv from "@next/env";
import { GoogleGenAI } from "@google/genai";

nextEnv.loadEnvConfig(process.cwd());
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL;
if (!apiKey || !model || !/^[a-zA-Z0-9._-]{1,100}$/.test(model)) {
  console.error("Key atau nama model Gemini belum dikonfigurasi dengan benar.");
  process.exitCode = 1;
} else {
  try {
    const client = new GoogleGenAI({ apiKey, vertexai: false, httpOptions: { timeout: 10000, retryOptions: { attempts: 1 } } });
    const result = await client.models.get({ model });
    const supported = result.supportedActions?.includes("generateContent") || result.supportedGenerationMethods?.includes("generateContent");
    console.log(`Metadata model dapat diakses. generateContent tercantum: ${Boolean(supported)}. Tidak melakukan generasi konten.`);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : "network_error";
    console.error(`Pemeriksaan metadata model belum berhasil (${status}). Key dan respons mentah tidak dicetak.`);
    process.exitCode = 1;
  }
}
