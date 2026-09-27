import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { parsePages, type WikiPage } from "../src/importers/wiki-xml.js";

const fixture = fileURLToPath(new URL("./fixtures/wiki-sample.xml", import.meta.url));

async function all(): Promise<WikiPage[]> {
  const out: WikiPage[] = [];
  for await (const p of parsePages(createReadStream(fixture, { encoding: "utf8" }))) out.push(p);
  return out;
}

test("yields one page per <page> with the latest revision's text", async () => {
  const pages = await all();
  expect(pages.map((p) => p.id)).toEqual(["101", "102", "103"]);
  expect(pages[0]).toMatchObject({ title: "Thunderfury", ns: 0, redirect: false, timestamp: "2023-05-01T00:00:00Z" });
  expect(pages[0].text).toContain("Blessed Blade & more.");
  expect(pages[0].text).not.toContain("Old text");
});

test("marks redirects and keeps the namespace", async () => {
  const pages = await all();
  expect(pages[1].redirect).toBe(true);
  expect(pages[2].ns).toBe(2);
});

test("stopping early does not hang", async () => {
  for await (const p of parsePages(createReadStream(fixture, { encoding: "utf8" }))) {
    expect(p.id).toBe("101");
    break;
  }
});
