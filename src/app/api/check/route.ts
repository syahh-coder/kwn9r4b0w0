import { NextResponse } from "next/server";
import { parseCheckInput } from "@/lib/check-input.mjs";
import { readBoundedJson, JsonInputError } from "@/lib/bounded-json.mjs";
import { checkRequest } from "@/lib/check-server";
import { CheckError, checkMessages } from "@/lib/check-service.mjs";

export const runtime = "nodejs";
export const maxDuration = 90;
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: { code: "invalid_content_type", message: "Kirim data dalam format JSON." } }, { status: 415, headers: noStore });
  }
  let payload: unknown;
  try {
    payload = await readBoundedJson(request);
  } catch (err) {
    const tooLarge = err instanceof JsonInputError && err.code === "payload_too_large";
    return NextResponse.json({ error: {
      code: tooLarge ? "payload_too_large" : "invalid_json",
      message: tooLarge ? "Data terlalu besar." : "JSON tidak valid.",
    } }, { status: tooLarge ? 413 : 400, headers: noStore });
  }
  const parsed = parseCheckInput(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: { code: "invalid_input", message: parsed.reason } }, { status: 400, headers: noStore });
  }
  try { return NextResponse.json(await checkRequest(parsed.value, request.headers), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    const code = error instanceof CheckError ? error.code : "service_unavailable";
    const status = error instanceof CheckError ? error.status : 503;
    const message = checkMessages[code as keyof typeof checkMessages] || checkMessages.service_unavailable;
    return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store",
      ...(error instanceof CheckError && error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) } });
  }
}
