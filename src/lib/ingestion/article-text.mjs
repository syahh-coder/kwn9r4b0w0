import { parse } from "parse5";
import { IngestionError } from "./url-policy.mjs";

const IGNORE = new Set(["script", "style", "noscript", "template", "svg", "iframe", "nav", "header", "footer", "aside", "form"]);
const BLOCK = new Set(["p", "div", "section", "article", "main", "h1", "h2", "h3", "li", "br", "blockquote"]);
const normalize = value => value.replace(/\s+/g, " ").trim();
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
function visible(node) {
  return !IGNORE.has(node.tagName) && attr(node, "hidden") === undefined && attr(node, "aria-hidden") !== "true";
}
function content(node) {
  const stack = [node];
  const parts = [];
  while (stack.length) {
    const current = stack.pop();
    if (typeof current === "string") { parts.push(current); continue; }
    if (!visible(current)) continue;
    if (current.nodeName === "#text") { parts.push(current.value); continue; }
    const children = current.childNodes || [];
    for (let index = children.length - 1; index >= 0; index--) {
      if (BLOCK.has(children[index].tagName)) stack.push("\n");
      stack.push(children[index]);
    }
  }
  return parts.join("");
}

/** Extract submitted-source text only; NOT factual claim extraction, evidence or verdict.
 * HTML is parsed without scripts/network/browser; returns plain strings, never raw HTML.
 */
export function extractArticleText(document) {
  if (typeof document.body !== "string") throw new IngestionError("unsupported_content");
  if (Buffer.byteLength(document.body, "utf8") > 512_000) throw new IngestionError("content_too_large");
  let raw = document.body;
  let title = null;
  let publishedAt = null;
  let contentScope = "plain_text";
  if (document.contentType !== "text/plain") {
    const root = parse(raw);
    let article, main, body;
    // Iterative traversal avoids stack overflow while finding metadata.
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (node.tagName === "title" && !title) title = normalize(content(node)).slice(0, 1000) || null;
      if (node.tagName === "meta" && attr(node, "property") === "article:published_time") {
        const value = attr(node, "content");
        if (value && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))) publishedAt = value;
      }
      if (!visible(node)) continue;
      if (node.tagName === "article") article ||= node;
      if (node.tagName === "main") main ||= node;
      if (node.tagName === "body") body ||= node;
      const children = node.childNodes || [];
      for (let index = children.length - 1; index >= 0; index--) stack.push(children[index]);
    }
    const scope = article || main || body || root;
    contentScope = article ? "article" : main ? "main" : "body_fallback";
    raw = content(scope);
  }
  const normalized = normalize(raw);
  if (normalized.length < 20) throw new IngestionError("insufficient_text");
  return {
    sourceUrl: document.finalUrl, title, publishedAt, retrievedAt: document.retrievedAt,
    text: normalized.slice(0, 12000), truncated: normalized.length > 12000,
    contentScope, contentKind: "submitted_article", contextVerified: false,
  };
}
