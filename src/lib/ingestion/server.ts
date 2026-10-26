import "server-only";
import { createArticleFetcher } from "./safe-article-fetch.mjs";
import { extractArticleText } from "./article-text.mjs";

const fetchArticle = createArticleFetcher();
// Internal only; deliberately not called by /api/check before rate-limit/review gates.
export async function retrieveSubmittedArticle(url: string) {
  return extractArticleText(await fetchArticle(url));
}
