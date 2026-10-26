/** Cookie-authenticated mutations must originate from this app. */
export function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const url = new URL(request.url);
  // Next.js may normalize request.url to the internal hostname. Host is the
  // actual browser-facing host; browsers cannot forge it on a cross-origin POST.
  const host = request.headers.get("host") || url.host;
  const protocol = request.headers.get("x-forwarded-proto") || url.protocol.slice(0, -1);
  return ["http", "https"].includes(protocol) && origin === `${protocol}://${host}`;
}
