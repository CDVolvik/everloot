// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fixture } from "@/lib/talents/fixture";
import { encodeBuild } from "@/lib/talents/share";
import TalentCalculator from "./TalentCalculator";

let container: HTMLDivElement;
let root: Root;
const ID = "0b6f1c1e-3f43-4a4e-9a51-3d2a1f0c9e11";
const CODE = encodeBuild({ classSlug: "mage", specId: fixture.specId, build: fixture.build, ranks: { 11: { rank: 2 } } });
const saved = (over: object = {}) => ({
  id: ID, slug: "AbCd1234", name: "Fire", notes: "For raids", classSlug: "mage", characterId: null, code: CODE, code2: null,
  gameBuild: fixture.build, shared: true, active: false, link: "https://everloot.app/b/AbCd1234", updatedAt: "2026-10-20T12:00:00.000Z", showName: false, ...over,
});
let posts: Array<{ url: string; body: Record<string, unknown> }> = [];

/** The site's API, as far as the calculator talks to it: signed in or out, with these builds. */
function api(state: "in" | "out" | "off", builds = [saved()]) {
  posts = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (state === "off") return Response.json({ error: "Not found" }, { status: 404 });
    if (state === "out") return Response.json({ error: "Sign in to save builds.", signIn: "/sign-in?returnTo=%2Fme" }, { status: 401 });
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      posts.push({ url, body });
      if (url === "/api/me/characters") return Response.json({ character: { id: "2b6f1c1e-3f43-4a4e-9a51-3d2a1f0c9e22", name: body.name, classSlug: "mage", realm: null, note: null } }, { status: 201 });
      return Response.json({ build: saved({ id: body.id ?? "9b6f1c1e-3f43-4a4e-9a51-3d2a1f0c9e99", name: body.name, slug: "NewSlug1", link: "https://everloot.app/b/NewSlug1" }) }, { status: body.id ? 200 : 201 });
    }
    return Response.json({ characters: [{ id: "2b6f1c1e-3f43-4a4e-9a51-3d2a1f0c9e22", name: "Jaina", classSlug: "mage", realm: null, note: null }], builds });
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState(null, "", "/tools/talents/mage");
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const render = (props: { savedBuilds?: boolean; readOnly?: boolean; initialCodes?: (string | null)[] } = { savedBuilds: true }) =>
  act(async () => root.render(<TalentCalculator catalog={fixture} {...props} />));
const button = (label: RegExp) => [...container.querySelectorAll("button")].find((b) => label.test(b.textContent ?? ""));
const click = (el: Element) => act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
const status = () => container.querySelector('[role="status"]')!.textContent;
const node = (id: number) => container.querySelector<HTMLButtonElement>(`#talent-${id}`)!;
function type(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")!.set!;
  return act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); });
}
const panel = () => container.querySelector<HTMLFormElement>('form[aria-label="Save build"]');

test("without the switch there is no Save button and no account lookup", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await render({});
  expect(button(/^Save$/)).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
});

test("when the API says the feature is off, Save disappears", async () => {
  api("off");
  await render();
  expect(button(/^Save$/)).toBeUndefined();
});

test("signed out, Save offers sign-in and remembers the build for the way back", async () => {
  api("out");
  await render();
  expect(button(/^Save$/)!.disabled).toBe(true);
  await click(node(11));
  await click(button(/^Save$/)!);
  const prompt = container.querySelector('section[aria-label="Sign in to save builds"]')!;
  expect(prompt.textContent).toContain("Sign in to save builds");
  const link = prompt.querySelector("a")!;
  expect(link.getAttribute("href")).toBe("/sign-in?returnTo=%2Ftools%2Ftalents%2Fmage%3Fsave%3D1");
  link.addEventListener("click", (e) => e.preventDefault());
  await click(link);
  expect(JSON.parse(sessionStorage.getItem("everloot:pending-save")!)).toEqual({ path: "/tools/talents/mage", hash: window.location.hash });
  expect(window.location.hash).toMatch(/^#plan=EL1-mage-/);
});

test("back from sign-in, the build is restored and the save panel opens", async () => {
  api("in", []);
  sessionStorage.setItem("everloot:pending-save", JSON.stringify({ path: "/tools/talents/mage", hash: `#plan=${CODE}` }));
  window.history.replaceState(null, "", "/tools/talents/mage?save=1");
  await render();
  expect(node(11).textContent).toContain("2/5");
  expect(panel()).not.toBeNull();
  expect(window.location.search).toBe("");
  expect(sessionStorage.getItem("everloot:pending-save")).toBeNull();
});

test("a new build is saved with its name, character, notes and codes, and the page then edits it", async () => {
  api("in", []);
  await render();
  await click(node(11));
  await click(button(/^Save$/)!);
  const form = panel()!;
  expect(form.querySelector<HTMLInputElement>("input")!.value).toBe("Left Mage 1/0");
  await type(form.querySelector("input")!, "My frost");
  await type(form.querySelector("select")!, "new");
  await type(form.querySelectorAll<HTMLInputElement>("input")[1], "Jaina");
  await type(form.querySelector("textarea")!, "Raid night");
  await click(button(/^Save build$/)!);
  expect(posts.map((p) => p.url)).toEqual(["/api/me/characters", "/api/me/builds"]);
  expect(posts[0].body).toMatchObject({ name: "Jaina", classSlug: "mage" });
  expect(posts[1].body).toEqual({
    name: "My frost", notes: "Raid night", characterId: "2b6f1c1e-3f43-4a4e-9a51-3d2a1f0c9e22",
    code: encodeBuild({ classSlug: "mage", specId: fixture.specId, build: fixture.build, ranks: { 11: { rank: 1 } } }), code2: null, shared: true,
  });
  expect(status()).toBe("Saved as a new build. Short link: https://everloot.app/b/NewSlug1");
  expect(new URLSearchParams(window.location.search).get("saved")).toBe("9b6f1c1e-3f43-4a4e-9a51-3d2a1f0c9e99");
  expect(container.textContent).toContain("Editing: My frost");
});

test("opened from a saved build, Save updates it in place and Save as new makes a copy", async () => {
  api("in");
  window.history.replaceState(null, "", `/tools/talents/mage?saved=${ID}#plan=${CODE}`);
  await render();
  expect(container.textContent).toContain("Editing: Fire");
  await click(node(11));
  await click(button(/^Save$/)!);
  expect(panel()!.querySelector("input")!.value).toBe("Fire");
  expect(panel()!.querySelector("textarea")!.value).toBe("For raids");
  await click(panel()!.querySelector('button[type="submit"]')!);
  expect(posts[0].body).toMatchObject({ id: ID, name: "Fire" });
  expect(status()).toBe("Saved. Short link: https://everloot.app/b/NewSlug1");
  await click(button(/^Save$/)!);
  await click(button(/^Save as new$/)!);
  expect(posts[1].body.id).toBeUndefined();
  expect(status()).toContain("Saved as a new build");
});

test("My builds lists this class's saved builds", async () => {
  api("in", [saved(), saved({ id: "5b6f1c1e-3f43-4a4e-9a51-3d2a1f0c9e55", name: "Warrior thing", classSlug: "warrior" })]);
  await render();
  const menu = container.querySelector("details")!;
  expect(menu.textContent).toContain("Fire");
  expect(menu.textContent).not.toContain("Warrior thing");
  expect(menu.querySelector("a")!.getAttribute("href")).toBe(`/tools/talents/mage?saved=${ID}#plan=${CODE}`);
});

test("read-only, the build shows as saved and points cannot change", async () => {
  vi.stubGlobal("fetch", vi.fn());
  window.history.replaceState(null, "", "/b/AbCd1234");
  await render({ readOnly: true, initialCodes: [CODE, null] });
  expect(node(11).textContent).toContain("2/5");
  await click(node(11));
  expect(node(11).textContent).toContain("2/5");
  expect(status()).toBe("This is a saved build. Open it in the calculator to change it.");
  expect(window.location.pathname).toBe("/b/AbCd1234");
  expect(window.location.hash).toBe("");
  expect(button(/Copy link|^Undo$|^Save$/)).toBeUndefined();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
