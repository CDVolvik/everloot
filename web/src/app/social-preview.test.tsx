import { expect, test } from "vitest";
import OpenGraphImage, { alt, contentType, size } from "./opengraph-image";
import TwitterImage from "./twitter-image";
import { metadata } from "./layout";

test("the site has a large social preview image built from the brand palette", async () => {
  expect(size).toEqual({ width: 1200, height: 630 });
  expect(contentType).toBe("image/png");
  expect(alt).toMatch(/Everloot/);
  const image = await OpenGraphImage();
  expect(image.headers.get("content-type")).toBe("image/png");
  const bytes = new Uint8Array(await image.arrayBuffer());
  expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  expect((await TwitterImage()).headers.get("content-type")).toBe("image/png");
});

test("shared links use the large card", () => {
  expect((metadata.twitter as { card?: string }).card).toBe("summary_large_image");
});
