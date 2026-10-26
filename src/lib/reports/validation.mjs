export const categories = { education: "Pendidikan", politics: "Politik", conservation: "Konservasi Alam" };
export const verdicts = { unverified: "Belum dapat diverifikasi", valid: "Valid", hoax: "Hoaks" };
export const reviewStatuses = { draft: "Draft", published: "Dipublikasikan", rejected: "Diarsipkan" };
export const validId = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
const text = (value, min, max) => typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
export const validVersion = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
export function safeSourceUrl(value) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port
      || !url.hostname.includes(".") || /^[\d.]+$/.test(url.hostname) || /(^|\.)(local|localhost|internal|test|invalid)$/.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
export function validateDraft(body, creating = false) {
  if (!exact(body, ["claim", "category", "verdict", "summary", "reasoning", "adminNotes", "sources", "expectedUpdatedAt"])
    || !text(body.claim, 20, 5000) || !Object.hasOwn(categories, body.category)
    || !Object.hasOwn(verdicts, body.verdict) || (creating && body.verdict !== "unverified")
    || !text(body.summary, 0, 3000) || !text(body.reasoning, 0, 8000) || !text(body.adminNotes, 0, 5000)
    || (!creating && !validVersion(body.expectedUpdatedAt)) || (creating && body.expectedUpdatedAt !== undefined)
    || !Array.isArray(body.sources) || body.sources.length > 20) return null;
  const sources = [];
  for (const source of body.sources) {
    if (!exact(source, ["url", "title", "excerpt", "publishedAt"]) || !safeSourceUrl(source.url)
      || !text(source.title, 1, 1000) || !text(source.excerpt, 0, 2000)
      || (source.publishedAt !== null && !validVersion(source.publishedAt))) return null;
    sources.push({ url: safeSourceUrl(source.url), title: source.title.trim(), excerpt: source.excerpt.trim(), publishedAt: source.publishedAt });
  }
  return { claim: body.claim.trim(), category: body.category, verdict: body.verdict,
    summary: body.summary.trim(), reasoning: body.reasoning.trim(), adminNotes: body.adminNotes.trim(), sources, candidates: [] };
}
export function validateAction(body) {
  if (!exact(body, ["action", "expectedUpdatedAt", "reviewed"]) || !validVersion(body.expectedUpdatedAt)
    || !["publish", "retract", "restore", "reject"].includes(body.action)
    || (body.reviewed !== undefined && typeof body.reviewed !== "boolean")
    || (body.action === "publish" && body.reviewed !== true)) return null;
  return { action: body.action, reviewed: body.reviewed === true, expectedUpdatedAt: body.expectedUpdatedAt };
}
