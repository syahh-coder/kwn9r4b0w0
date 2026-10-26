import test from "node:test";
import assert from "node:assert/strict";
import { isSameOrigin } from "../src/lib/admin-request.mjs";

test("admin mutations reject cross-origin, missing, null, and lookalike origins", () => {
  for (const origin of [undefined, "null", "https://evil.example", "https://cekfakta.example.evil.example"]) {
    const request = new Request("https://cekfakta.example/api/admin/login", { headers: origin ? { origin } : {} });
    assert.equal(isSameOrigin(request), false);
  }
  assert.equal(isSameOrigin(new Request("https://cekfakta.example/api/admin/login", { headers: { origin: "https://cekfakta.example" } })), true);
});

test("origin uses the external Host when Next normalizes the internal URL", () => {
  assert.equal(isSameOrigin(new Request("http://localhost:3100/api/admin/login", { headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" } })), true);
  assert.equal(isSameOrigin(new Request("http://localhost:3000/api/admin/login", { headers: { host: "cekfakta.example", "x-forwarded-proto": "https", origin: "https://cekfakta.example" } })), true);
  assert.equal(isSameOrigin(new Request("http://localhost:3000/api/admin/login", { headers: { host: "cekfakta.example", "x-forwarded-proto": "https", origin: "https://evil.example" } })), false);
});
