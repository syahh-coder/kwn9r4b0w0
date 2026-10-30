import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://invalid.invalid");
assert.ok(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname), "Helper hanya untuk Supabase lokal.");
assert.ok(process.env.TAVILY_API_KEY, "Isi TAVILY_API_KEY di .env.local; jangan kirim ke chat.");
for (const name of ["PUBLIC_CHECK_ENABLED", "GEMINI_ANALYSIS_ENABLED", "FACTCHECK_SEARCH_ENABLED"]) assert.equal(process.env[name], "true", `${name} belum aktif; siapkan integrasi check lokal dahulu.`);
const original = await readFile(".env.local", "utf8");
const newline = original.includes("\r\n") ? "\r\n" : "\n";
const lines = original.split(/\r?\n/); let replaced = false;
const updated = lines.map(line => { if (/^\s*WEB_SEARCH_ENABLED\s*=/.test(line)) { replaced = true; return "WEB_SEARCH_ENABLED=true"; } return line; });
if (!replaced) updated.push("WEB_SEARCH_ENABLED=true");
await writeFile(".env.local", updated.join(newline), "utf8");
console.log("Fallback Tavily aktif lokal. Key/model/backend credential dipertahankan; tidak mengubah paid plan atau billing. Restart server dev agar env baru dimuat.");
