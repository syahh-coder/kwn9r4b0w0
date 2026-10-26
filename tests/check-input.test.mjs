import test from "node:test";
import assert from "node:assert/strict";
import { parseCheckInput } from "../src/lib/check-input.mjs";

const base = { inputType: "text", input: "Apakah benar aturan beasiswa terbaru berlaku tahun ini?", category: "education" };
test("valid text is accepted as input (not verified as true)", () => {
  const res = parseCheckInput(base);
  assert.equal(res.ok, true);
});
test("too-short text is rejected", () => {
  const res = parseCheckInput({ ...base, input: "hoaks" });
  assert.equal(res.ok, false);
});
test("invalid topic is rejected", () => {
  const res = parseCheckInput({ ...base, category: "finance" });
  assert.equal(res.ok, false);
});
test("missing input is rejected", () => {
  const res = parseCheckInput({ ...base, input: null });
  assert.equal(res.ok, false);
});
test("normal public URL syntax is accepted (not fetched)", () => {
  const res = parseCheckInput({ inputType: "url", input: "https://www.example.org/news/1", category: "politics" });
  assert.equal(res.ok, true);
});
test("non-http URL scheme is rejected", () => {
  const res = parseCheckInput({ inputType: "url", input: "file:///etc/passwd", category: "politics" });
  assert.equal(res.ok, false);
});
test("localhost shape is rejected", () => {
  const res = parseCheckInput({ inputType: "url", input: "http://localhost/admin", category: "politics" });
  assert.equal(res.ok, false);
});
test("credentials in URL are rejected", () => {
  const res = parseCheckInput({ inputType: "url", input: "https://user:pass@example.org", category: "politics" });
  assert.equal(res.ok, false);
});
test("oversized text is rejected", () => {
  const res = parseCheckInput({ ...base, input: "x".repeat(5001) });
  assert.equal(res.ok, false);
});
test("text boundaries use trimmed input", () => {
  assert.equal(parseCheckInput({ ...base, input: " ".repeat(20) }).ok, false);
  assert.equal(parseCheckInput({ ...base, input: `  ${"a".repeat(20)}  ` }).value.input.length, 20);
  assert.equal(parseCheckInput({ ...base, input: "a".repeat(5000) }).ok, true);
});
test("missing input mode and malformed URL are rejected", () => {
  assert.equal(parseCheckInput({ ...base, inputType: "other" }).ok, false);
  assert.equal(parseCheckInput({ ...base, inputType: "url", input: "bukan tautan" }).ok, false);
  assert.equal(parseCheckInput({ ...base, inputType: "url", input: `https://example.org/${"a".repeat(2000)}` }).ok, false);
});
