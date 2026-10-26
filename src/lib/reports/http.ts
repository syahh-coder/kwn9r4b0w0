import "server-only";
import { NextResponse } from "next/server";
import { getAdminAccess } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/admin-request.mjs";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);
export async function authorize(request: Request, mutation = false) {
  if (mutation && !isSameOrigin(request)) return { response: fail(403, "forbidden", "Asal permintaan tidak diizinkan.") };
  const access = await getAdminAccess();
  if (access.status !== 200) return { response: fail(access.status, access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "service_unavailable", "Akses admin tidak tersedia. Periksa sesi dan izin akun.") };
  return { access };
}
export async function readDocument(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return { response: fail(415, "unsupported_media_type", "Gunakan JSON.") };
  if (!request.body) return { response: fail(400, "invalid_input", "Isi permintaan diperlukan.") };
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  const deadline = AbortSignal.timeout(5000);
  try {
    for (;;) {
      const result = await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
        const abort = () => reject(new Error("timeout"));
        deadline.addEventListener("abort", abort, { once: true });
        if (deadline.aborted) { abort(); return; }
        reader.read().then(resolve, reject).finally(() => deadline.removeEventListener("abort", abort));
      });
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 100_000) return { response: fail(413, "payload_too_large", "Isi permintaan terlalu besar.") };
      chunks.push(result.value);
    }
    return { body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown };
  } catch { return { response: fail(400, "invalid_input", "JSON tidak valid atau waktu pembacaan habis.") }; }
  finally { void reader.cancel().catch(() => undefined); }
}
export function databaseFailure(error: { code?: string }) {
  if (error.code === "40001") return fail(409, "conflict", "Laporan telah berubah. Muat ulang sebelum melanjutkan.");
  if (error.code === "P0002") return fail(404, "not_found", "Laporan tidak ditemukan.");
  if (error.code === "42501") return fail(403, "forbidden", "Operasi tidak diizinkan.");
  if (["22023", "23514", "22007", "22008", "23502"].includes(error.code || "")) return fail(422, "invalid_report", "Lengkapi data, sumber, dan persetujuan review; periksa status laporan.");
  return fail(503, "service_unavailable", "Laporan belum dapat diproses. Coba lagi nanti.");
}
