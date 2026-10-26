import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

export class IngestionError extends Error {
  constructor(code) { super(code); this.name = "IngestionError"; this.code = code; }
}
const denyV4 = ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4"].map(ipaddr.parseCIDR);
const denyV6 = ["2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20"].map(ipaddr.parseCIDR);
const globalV6 = ipaddr.parseCIDR("2000::/3");

/** Conservative public-unicast allow policy, not merely 'not RFC1918'. */
export function isPublicAddress(value) {
  if (typeof value !== "string" || !isIP(value)) return false;
  try {
    const address = ipaddr.parse(value);
    if (address.range() !== "unicast") return false;
    if (address.kind() === "ipv4") return !denyV4.some(range => address.match(range));
    return address.match(globalV6) && !denyV6.some(range => address.match(range));
  } catch { return false; }
}

/** Only standard-port HTTP(S); no credentials, odd IPv4 encodings, or local names. */
export function parseArticleUrl(input, base) {
  if (typeof input !== "string" || input.length > 2000 || !input || /[\s\\\u0000-\u001f\u007f]/u.test(input)) throw new IngestionError("fetch_blocked");
  let url;
  try { url = base ? new URL(input, base) : new URL(input); } catch { throw new IngestionError("fetch_blocked"); }
  const authority = input.match(/^(?:[a-z][a-z\d+.-]*:)?\/\/([^/?#]*)/i)?.[1];
  if (authority?.includes("%")) throw new IngestionError("fetch_blocked");
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port || url.href.length > 2000) throw new IngestionError("fetch_blocked");
  let host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (!host || host.includes("%") || /(^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(host)
    || host.endsWith(".home.arpa") || (!isIP(host) && (!host.includes(".") || host.includes("..")))) throw new IngestionError("fetch_blocked");
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new IngestionError("fetch_blocked");
    if (isIP(host) === 4 && authority && authority.split(":")[0] !== host) throw new IngestionError("fetch_blocked");
  }
  url.hash = "";
  if (!isIP(host)) url.hostname = host;
  return url;
}

export async function resolveArticleTarget(url, resolver, signal) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const family = isIP(host);
  const records = family ? [{ address: host, family }] : await abortable(resolver(host, { all: true, verbatim: true }), signal);
  // Mixed public/private DNS answers fail closed. No choosing the convenient answer.
  if (!Array.isArray(records) || records.length === 0 || records.length > 64 || records.some(record => !isPublicAddress(record.address) || isIP(record.address) !== record.family)) throw new IngestionError("fetch_blocked");
  return records[0];
}

export function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(new IngestionError("fetch_timeout"));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new IngestionError("fetch_timeout"));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
