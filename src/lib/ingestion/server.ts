import "server-only";
import { createArticleFetcher } from "./safe-article-fetch.mjs";
import { extractArticleText } from "./article-text.mjs";

const fetchArticle = createArticleFetcher();
// The check service calls this only after shared DB rate/budget reservation.
export async function retrieveSubmittedArticle(url: string) {
  return extractArticleText(await fetchArticle(url));
}
