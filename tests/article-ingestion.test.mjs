import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { isPublicAddress, parseArticleUrl, IngestionError } from "../src/lib/ingestion/url-policy.mjs";
import { createArticleFetcher, requestPinned } from "../src/lib/ingestion/safe-article-fetch.mjs";
import { extractArticleText } from "../src/lib/ingestion/article-text.mjs";

const publicTarget = { address: "93.184.215.14", family: 4 };
const resolvePublic = async () => [publicTarget];
const validUrl = "https://news.example.org/article";
const page = { status: 200, contentType: "text/html", body: "<article><p>Teks artikel fiktif khusus pengujian pengambilan.</p></article>" };
const code = expected => error => error instanceof IngestionError && error.code === expected;

test("deny private, loopback, link-local, reserved, multicast and IPv6 transition addresses", () => {
  for (const address of ["0.0.0.0", "10.0.0.1", "127.0.0.1", "100.64.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "192.0.0.9", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255", "::", "::1", "::ffff:127.0.0.1", "::ffff:8.8.8.8", "64:ff9b::808:808", "fc00::1", "fe80::1", "ff02::1", "2001:db8::1", "2001::1", "2002:0808:0808::1", "3fff::1", "4000::1"]) assert.equal(isPublicAddress(address), false, address);
  for (const address of ["8.8.8.8", publicTarget.address, "2606:4700:4700::1111"]) assert.equal(isPublicAddress(address), true, address);
});
test("block credentials, nonstandard ports, protocols, local names and alternative IPv4 encodings", () => {
  for (const url of ["file:///etc/passwd", "ftp://example.org/a", "http://localhost/a", "http://a.localhost/a", "http://metadata.google.internal/", "http://router.home.arpa/", "http://machine/", "http://127.1/", "http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/", "http://0x08080808/", "http://134744072/", "https://user:pass@example.org/", "https://example.org:444/", "https://example.org\\@127.0.0.1/", "https://example.org/\nheader", "http://[::1]/"]) assert.throws(() => parseArticleUrl(url), code("fetch_blocked"), url);
  assert.equal(parseArticleUrl("https://news.example.org:443/a#fragment").href, "https://news.example.org/a");
});
test("private and mixed DNS answers blocked BEFORE transport", async () => {
  let connections = 0;
  for (const answers of [[], [{ address: "127.0.0.1", family: 4 }], [publicTarget, { address: "169.254.169.254", family: 4 }], [{ address: "::ffff:127.0.0.1", family: 6 }], [{ address: "8.8.8.8", family: 6 }]]) {
    const fetcher = createArticleFetcher({ resolver: async () => answers, transport: async () => { connections++; return page; } });
    await assert.rejects(fetcher(validUrl), code("fetch_blocked"));
  }
  assert.equal(connections, 0);
});
test("redirect to metadata/private target is blocked before second connection", async () => {
  let connections = 0;
  const fetcher = createArticleFetcher({ resolver: resolvePublic, transport: async () => { connections++; return { status: 302, location: "http://169.254.169.254/latest/meta-data/" }; } });
  await assert.rejects(fetcher("http://news.example.org/a"), code("fetch_blocked"));
  assert.equal(connections, 1);
});
test("same-host redirect re-resolves DNS and blocks rebinding", async () => {
  let resolutions = 0; let connections = 0;
  const fetcher = createArticleFetcher({ resolver: async () => ++resolutions === 1 ? [publicTarget] : [{ address: "127.0.0.1", family: 4 }], transport: async () => { connections++; return { status: 302, location: "/next" }; } });
  await assert.rejects(fetcher(validUrl), code("fetch_blocked"));
  assert.equal(resolutions, 2); assert.equal(connections, 1);
});
test("relative redirect works; cycles, excessive redirects and HTTPS downgrade fail", async () => {
  let connections = 0;
  const fetcher = createArticleFetcher({ resolver: resolvePublic, transport: async () => ++connections === 1 ? { status: 301, location: "/new#anchor" } : page });
  assert.equal((await fetcher(validUrl)).finalUrl, "https://news.example.org/new");
  for (const [location, expected] of [[validUrl, "redirect_limit"], ["http://news.example.org/new", "fetch_blocked"]]) {
    await assert.rejects(createArticleFetcher({ resolver: resolvePublic, transport: async () => ({ status: 302, location }) })(validUrl), code(expected));
  }
  connections = 0;
  await assert.rejects(createArticleFetcher({ resolver: resolvePublic, transport: async () => ({ status: 302, location: `/next-${++connections}` }) })(validUrl), code("redirect_limit"));
  assert.equal(connections, 4);
});
test("global timeout includes DNS; late DNS cannot initiate a connection", async () => {
  let connections = 0;
  const fetcher = createArticleFetcher({ timeoutMs: 15, resolver: async () => { await new Promise(resolve => setTimeout(resolve, 40)); return [publicTarget]; }, transport: async () => { connections++; return page; } });
  await assert.rejects(fetcher(validUrl), code("fetch_timeout"));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(connections, 0);
});

function fakeRequest({ status = 200, headers = { "content-type": "text/html; charset=utf-8" }, chunks = [Buffer.from("<p>Fixture</p>")], inspect = () => {}, hang = false, complete = true } = {}) {
  return (url, options, callback) => {
    inspect(url, options);
    const req = new EventEmitter();
    req.end = () => {
      if (hang) { options.signal.addEventListener("abort", () => req.emit("error", new Error("abort")), { once: true }); return; }
      const response = Readable.from(chunks);
      response.statusCode = status; response.headers = headers; response.complete = complete;
      callback(response);
    };
    return req;
  };
}
const transportWith = options => (url, target, limits) => requestPinned(url, target, { ...limits, requestImpl: fakeRequest(options) });

test("transport options pin lookup while preserving original Host/TLS URL and isolated connection", async () => {
  let lookedUp = 0;
  const fetcher = createArticleFetcher({ resolver: resolvePublic, transport: transportWith({ inspect(url, options) {
    assert.equal(url.hostname, "news.example.org"); assert.equal(options.agent, false);
    assert.equal(options.headers["Accept-Encoding"], "identity");
    assert.equal(options.maxHeaderSize, 16_384);
    assert.equal("Authorization" in options.headers, false); assert.equal("Cookie" in options.headers, false);
    options.lookup(url.hostname, {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, publicTarget.address); assert.equal(family, 4); lookedUp++; });
    options.lookup(url.hostname, { all: true }, (error, records) => { assert.equal(error, null); assert.deepEqual(records, [publicTarget]); lookedUp++; });
  } }) });
  assert.equal((await fetcher(validUrl)).body, "<p>Fixture</p>"); assert.equal(lookedUp, 2);
});
test("stream/content-length cap, compression, MIME, charset and incomplete response rejected", async () => {
  const scenarios = [
    [{ headers: { "content-type": "text/plain", "content-length": "999" } }, "content_too_large"],
    [{ headers: { "content-type": "text/plain" }, chunks: [Buffer.alloc(40), Buffer.alloc(40)] }, "content_too_large"],
    [{ headers: { "content-type": "application/pdf" } }, "unsupported_content"],
    [{ headers: { "content-type": "text/html", "content-encoding": "gzip" } }, "unsupported_content"],
    [{ headers: { "content-type": "text/html; charset=windows-1252" } }, "unsupported_content"],
    [{ chunks: [Buffer.from([255, 255])] }, "unsupported_content"],
    [{ status: 404 }, "source_unavailable"], [{ complete: false }, "source_unavailable"],
    [{ status: 302, headers: {} }, "fetch_blocked"],
  ];
  for (const [options, expected] of scenarios) await assert.rejects(createArticleFetcher({ resolver: resolvePublic, maxBytes: 64, transport: transportWith(options) })(validUrl), code(expected));
});
test("total timeout aborts a stalled connection and sanitizes transport/DNS errors", async () => {
  await assert.rejects(createArticleFetcher({ resolver: resolvePublic, timeoutMs: 15, transport: transportWith({ hang: true }) })(validUrl), code("fetch_timeout"));
  await assert.rejects(createArticleFetcher({ resolver: async () => { throw new Error("SECRET_DNS_DETAILS"); } })(validUrl), code("source_unavailable"));
  assert.throws(() => createArticleFetcher({ maxBytes: 99999999 }), /invalid_fetch_limits/);
});
test("HTML extracts plain article text and explicit metadata, excludes scripts/navigation, never follows embedded URLs", () => {
  const result = extractArticleText({ ...page, finalUrl: validUrl, retrievedAt: "2026-10-24T00:00:00Z", body: `<html><head><title>Judul &amp; konteks</title><meta property="article:published_time" content="2025-03-04T01:02:03Z"></head><body><nav>Navigasi</nav><article><h1>Klaim fiktif</h1><p>Kebijakan X tidak berlaku pada 2025 &amp; perlu ditinjau.</p><script>fetch('http://127.0.0.1')</script><p hidden>Rahasia</p><iframe src="http://169.254.169.254"></iframe></article><footer>Footer</footer></body></html>` });
  assert.equal(result.title, "Judul & konteks"); assert.equal(result.publishedAt, "2025-03-04T01:02:03Z");
  assert.match(result.text, /tidak berlaku pada 2025/);
  assert.doesNotMatch(result.text, /fetch|Navigasi|Footer|Rahasia|127\.0/);
  assert.equal(result.contextVerified, false); assert.equal(result.contentKind, "submitted_article"); assert.equal("verdict" in result, false);
});
test("plain text, no fabricated date, truncation, minimal content and deeply nested markup", () => {
  const document = { finalUrl: validUrl, retrievedAt: "2026-10-24T00:00:00Z", contentType: "text/plain", body: "a".repeat(12001) };
  const result = extractArticleText(document); assert.equal(result.text.length, 12000); assert.equal(result.truncated, true); assert.equal(result.publishedAt, null);
  assert.throws(() => extractArticleText({ ...document, body: "pendek" }), code("insufficient_text"));
  assert.throws(() => parseArticleUrl("https://%65xample.org/a"), code("fetch_blocked"));
  assert.throws(() => extractArticleText({ ...document, body: "a".repeat(512001) }), code("content_too_large"));
  const deep = extractArticleText({ ...document, contentType: "text/html", body: `${"<div>".repeat(1000)}Teks fiktif dengan konteks yang cukup.${"</div>".repeat(1000)}` });
  assert.equal(deep.contentScope, "body_fallback"); assert.equal(deep.publishedAt, null);
});
