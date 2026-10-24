import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { loadNews, newsSitemapPaths, postText, publishedPost, publishedPosts, renderNewsFeed } from "./news";

const FIXTURES = fileURLToPath(new URL("../test/news", import.meta.url));

test("reads every post that parses, shows only the published ones, newest first", () => {
  const news = loadNews(FIXTURES);
  expect([...news.keys()].sort()).toEqual(["older-post", "test-draft", "test-post"]);
  expect(publishedPosts(news).map((p) => p.slug)).toEqual(["test-post", "older-post"]);
  expect(publishedPost(news, "test-draft")).toBeNull();
  expect(publishedPost(news, "test-post")?.tags).toEqual(["site", "database"]);
  // Fields the front matter leaves out get their defaults.
  expect(publishedPost(news, "older-post")).toMatchObject({ tags: [], sources: [] });
});

test("the sitemap lists the hub and each post, dated by the day it last changed", () => {
  expect(newsSitemapPaths(loadNews(FIXTURES))).toEqual([
    { path: "/news", lastModified: new Date("2026-10-25") },
    { path: "/news/test-post", lastModified: new Date("2026-10-25") },
    { path: "/news/older-post", lastModified: new Date("2026-10-20") },
  ]);
  expect(newsSitemapPaths(new Map())).toEqual([]);
});

test("the post's text reads its paragraphs and lists, a token as one word", () => {
  const post = publishedPost(loadNews(FIXTURES), "test-post")!;
  const text = postText(post.blocks);
  expect(text).toContain("This fixture stands in for a real post.");
  expect(text).toContain("The dungeon page X is published");
  expect(text).not.toContain("A quote stays a quote");
});

test("the feed escapes what it prints and dates the channel by the newest change", () => {
  const posts = publishedPosts(loadNews(FIXTURES));
  const xml = renderNewsFeed([{ ...posts[0], title: "Tom & <Jerry>" }], { baseUrl: "https://everloot.app/", now: new Date("2026-10-26") });
  expect(xml).toContain("<title>Tom &amp; &lt;Jerry&gt;</title>");
  expect(xml).toContain('<guid isPermaLink="true">https://everloot.app/news/test-post</guid>');
  expect(xml).toContain(`<lastBuildDate>${new Date("2026-10-25").toUTCString()}</lastBuildDate>`);
  expect(renderNewsFeed([], { baseUrl: "https://everloot.app", now: new Date("2026-10-26") })).toContain(`<lastBuildDate>${new Date("2026-10-26").toUTCString()}</lastBuildDate>`);
});
