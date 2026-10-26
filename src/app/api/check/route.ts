import { NextResponse } from "next/server";
import { parseCheckInput } from "@/lib/check-input.mjs";

const MAX_BODY_BYTES = 12_000;

async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("invalid_json");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) throw new Error("payload_too_large");
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(merged)) as unknown; }
  catch { throw new Error("invalid_json"); }
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: { code: "invalid_content_type", message: "Kirim data dalam format JSON." } }, { status: 415 });
  }
  let payload: unknown;
  try {
    payload = await readBoundedJson(request);
  } catch (err) {
    const tooLarge = err instanceof Error && err.message === "payload_too_large";
    return NextResponse.json({ error: {
      code: tooLarge ? "payload_too_large" : "invalid_json",
      message: tooLarge ? "Data terlalu besar." : "JSON tidak valid.",
    } }, { status: tooLarge ? 413 : 400 });
  }
  const parsed = parseCheckInput(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: { code: "invalid_input", message: parsed.reason } }, { status: 400 });
  }
  // Scaffolding only! NEVER change this into a 'valid' or 'hoax' result without
  // fact-check evidence retrieval, policy guard, and moderation.
  return NextResponse.json({
    verdict: "unverified",
    analysisAvailable: false,
    mode: "validation_only",
    reviewStatus: null,
    message: "Input diterima, tetapi mesin pemeriksaan fakta belum terhubung. Tidak ada verifikasi berita yang dilakukan.",
    category: parsed.value?.category,
    sources: [],
  }, { headers: { "Cache-Control": "no-store" } });
}
