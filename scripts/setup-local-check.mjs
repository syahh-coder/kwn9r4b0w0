// Explicit local setup only. Never prints keys or edits cloud settings.
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
try {
  const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const target = new URL(status.API_URL);
  if (target.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(target.hostname)
    || process.env.NEXT_PUBLIC_SUPABASE_URL !== status.API_URL || !status.SERVICE_ROLE_KEY) throw new Error("local_target_required");
  if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL || !process.env.GOOGLE_FACTCHECK_API_KEY) throw new Error("provider_config_required");
  const file = new URL("../.env.local", import.meta.url);
  let content = await readFile(file, "utf8");
  const values = {
    ...(!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY ? { SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY } : {}),
    ...(!process.env.CHECK_HASH_SECRET ? { CHECK_HASH_SECRET: randomBytes(32).toString("hex") } : {}),
    PUBLIC_CHECK_ENABLED: "true", GEMINI_ANALYSIS_ENABLED: "true", FACTCHECK_SEARCH_ENABLED: "true",
    ...(process.argv.includes("--enable-url") ? { PUBLIC_URL_CHECK_ENABLED: "true" } : {}),
  };
  for (const [key, value] of Object.entries(values)) {
    const line = new RegExp(`^${key}=.*$`, "gm");
    if (line.test(content)) content = content.replace(line, `${key}=${value}`);
    else content += `\n${key}=${value}\n`;
  }
  // URL ingestion deliberately remains opt-in until deployment security review.
  if (!/^PUBLIC_URL_CHECK_ENABLED=/m.test(content)) content += "\nPUBLIC_URL_CHECK_ENABLED=false\n";
  await writeFile(file, content, "utf8");
  console.log(`Setup lokal selesai: key backend dan hash secret tersedia, analisis teks diaktifkan. Key/model provider tidak diganti. ${process.argv.includes("--enable-url") ? "URL lokal diaktifkan secara eksplisit; gate deployment tetap wajib." : "Flag URL yang sudah ada dipertahankan, default baru false."} Restart dev server.`);
} catch { console.error("Setup belum selesai. Pastikan Supabase lokal aktif, URL sesuai dan konfigurasi provider lengkap. Secret tidak dicetak."); process.exitCode = 1; }
