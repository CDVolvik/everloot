import { expect, test } from "vitest";
import { callbackUrl, parseConnectRequest, sealForDesktop } from "../../web/src/lib/desktop-connect";
import { connectInBrowser } from "../src/main/connect";

const token = `evl_${"cd".repeat(32)}`;

/** Plays the browser: reads the connect link the app opened, then calls back the way the page would. */
function browser(act: (request: NonNullable<ReturnType<typeof parseConnectRequest>>, opened: URL) => Promise<void>) {
  return (link: string) => {
    const opened = new URL(link);
    const request = parseConnectRequest(Object.fromEntries(opened.searchParams))!;
    void act(request, opened);
  };
}

test("the browser's sealed key comes back to the app, and the link goes to the site's connect page", async () => {
  let seen = "";
  const key = await connectInBrowser("https://everloot.example/", browser(async (request, opened) => {
    seen = `${opened.origin}${opened.pathname}`;
    const wrong = await fetch(`http://127.0.0.1:${request.port}/callback?state=nope`);
    expect(wrong.status).toBe(404);
    const res = await fetch(callbackUrl(request, await sealForDesktop(token, request)));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("is signed in");
  }));
  expect(key).toBe(token);
  expect(seen).toBe("https://everloot.example/desktop/connect");
});

test("Cancel in the browser, a garbled answer and no answer each end the wait with a reason", async () => {
  await expect(connectInBrowser("https://everloot.example", browser(async (request) => {
    await fetch(callbackUrl(request, { error: "denied" }));
  }))).rejects.toThrow("cancelled");
  await expect(connectInBrowser("https://everloot.example", browser(async (request) => {
    await fetch(`http://127.0.0.1:${request.port}/callback?state=${request.state}&epk=${"A".repeat(87)}&iv=${"A".repeat(16)}&ct=abc`);
  }))).rejects.toThrow("could not be read");
  await expect(connectInBrowser("https://everloot.example", () => {}, 50)).rejects.toThrow("timed out");
  const stop = new AbortController();
  const waiting = connectInBrowser("https://everloot.example", () => stop.abort(), undefined, stop.signal);
  await expect(waiting).rejects.toThrow("cancelled");
});
