import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
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

test("an input that closes before the end rejects instead of hanging", async () => {
  const src = new Readable({ read() {} });
  src.push("<mediawiki><page><title>A</title>");
  setTimeout(() => src.destroy(), 10);
  await expect(
    (async () => {
      for await (const _ of parsePages(src)) {
        // no complete page ever arrives
      }
    })(),
  ).rejects.toThrow();
});

test("malformed XML rejects without yielding pages from the bad chunk", async () => {
  const xml =
    "<mediawiki><page><title>A</title><ns>0</ns><id>1</id><revision><timestamp>t</timestamp>" +
    "<text>x</txt></revision></page></mediawiki>";
  const seen: string[] = [];
  await expect(
    (async () => {
      for await (const p of parsePages(Readable.from([xml]))) seen.push(p.id);
    })(),
  ).rejects.toThrow(/close tag/i);
  expect(seen).toEqual([]);
});

test("decodes a multi-byte character split across Buffer chunks", async () => {
  const bytes = Buffer.from(
    "<mediawiki><page><title>Dash — here</title><ns>0</ns><id>1</id><revision>" +
      "<timestamp>t</timestamp><text>ok</text></revision></page></mediawiki>",
    "utf8",
  );
  const cut = bytes.indexOf(Buffer.from("—", "utf8")) + 1;
  const pages: WikiPage[] = [];
  for await (const p of parsePages(Readable.from([bytes.subarray(0, cut), bytes.subarray(cut)]))) pages.push(p);
  expect(pages[0].title).toBe("Dash — here");
});
