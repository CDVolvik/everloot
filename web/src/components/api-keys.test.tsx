// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ApiKeys from "./ApiKeys";

let container: HTMLDivElement;
let root: Root;
const KEY = { id: "0b6f1c1e-3f43-4a4e-9a51-3d2a1f0c9e11", hint: "beef", label: "bot", created_at: "2026-10-19T00:00:00Z", last_used_at: null, revoked_at: null };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const buttonNamed = (label: string) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === label);

test("signed out, it offers the Battle.net sign-in", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ ok: false, error: "Sign in with Battle.net to manage keys." }, { status: 401 }));
  await act(async () => root.render(<ApiKeys />));
  expect(container.querySelector('a[href="/api/auth/bnet"]')?.textContent).toBe("Sign in with Battle.net");
});

test("with the guard off, it says keys are not switched on", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ ok: false, error: "API keys are not switched on yet." }, { status: 503 }));
  await act(async () => root.render(<ApiKeys />));
  expect(container.textContent).toContain("Keys are not switched on yet");
});

test("makes a key, shows it once, and revokes one", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  let keys = [KEY];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    if (init?.method === "POST") return Response.json({ ok: true, id: "x", token: `evl_${"c".repeat(64)}`, hint: "cccc" }, { status: 201 });
    if (init?.method === "DELETE") { keys = []; return Response.json({ ok: true }); }
    return Response.json({ ok: true, keys, limit: 5 });
  });
  await act(async () => root.render(<ApiKeys />));
  expect(container.textContent).toContain("evl_…beef");
  await act(async () => buttonNamed("Make a key")!.click());
  expect(container.textContent).toContain(`evl_${"c".repeat(64)}`);
  expect(container.textContent).toContain("not shown again");
  await act(async () => buttonNamed("Revoke")!.click());
  expect(calls.some(([url, init]) => init?.method === "DELETE" && url === `/api/keys?id=${KEY.id}`)).toBe(true);
  expect(buttonNamed("Revoke")).toBeUndefined();
});

test("a revoked key offers Delete, which erases it", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") { calls.push(url); return Response.json({ ok: true }); }
    return Response.json({ ok: true, keys: [{ ...KEY, revoked_at: "2026-10-19T01:00:00Z" }], limit: 5 });
  });
  await act(async () => root.render(<ApiKeys />));
  expect(buttonNamed("Revoke")).toBeUndefined();
  await act(async () => buttonNamed("Delete")!.click());
  expect(calls).toEqual([`/api/keys?id=${KEY.id}&erase=1`]);
});
