import { expect, test } from "vitest";
import { callbackUrl, connectPath, desktopKeyPair, openSealed, parseConnectRequest, sealForDesktop } from "./desktop-connect";

const token = `evl_${"ab".repeat(32)}`;

test("a sealed key opens only with the app's key and the same state", async () => {
  const app = await desktopKeyPair();
  const request = parseConnectRequest({ port: "51234", state: app.state, pub: app.pub })!;
  expect(request).toEqual({ port: 51234, state: app.state, pub: app.pub });
  const sealed = await sealForDesktop(token, request);
  expect(sealed.ct).not.toContain("evl_");
  expect(await openSealed(sealed, app.privateKey, app.state)).toBe(token);

  const other = await desktopKeyPair();
  await expect(openSealed(sealed, other.privateKey, app.state)).rejects.toThrow();
  await expect(openSealed(sealed, app.privateKey, other.state)).rejects.toThrow();
  await expect(openSealed({ ...sealed, ct: "x" }, app.privateKey, app.state)).rejects.toThrow();
  await expect(openSealed({ epk: "nope" }, app.privateKey, app.state)).rejects.toThrow("unreadable");
});

test("the request needs a high port, a 24-byte state and a P-256 point; the callback is always this computer", async () => {
  const app = await desktopKeyPair();
  for (const port of ["80", "1023", "65536", "12ab", undefined]) expect(parseConnectRequest({ port, state: app.state, pub: app.pub })).toBeNull();
  expect(parseConnectRequest({ port: "5000", state: "short", pub: app.pub })).toBeNull();
  expect(parseConnectRequest({ port: "5000", state: app.state, pub: "x".repeat(86) })).toBeNull();
  const request = parseConnectRequest({ port: "5000", state: app.state, pub: app.pub })!;
  expect(connectPath(request).length).toBeLessThan(512);
  expect(callbackUrl(request, { error: "denied" })).toBe(`http://127.0.0.1:5000/callback?state=${app.state}&error=denied`);
  const sealed = await sealForDesktop(token, request);
  expect(callbackUrl(request, sealed).startsWith("http://127.0.0.1:5000/callback?state=")).toBe(true);
});
