// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AccountShell } from "@/lib/account-shell-types";
import ChatClient, { SUGGESTIONS } from "./ChatClient";
import ChatKeys from "./ChatKeys";

const ME = "11111111-2222-4333-8444-555555555555";
const MAGE = "33333333-4444-4555-8666-777777777777";
const KEY = "sk-or-v1-secretsecretsecretsecret1234";
const PROVIDERS = "everloot.chat.providers.v1";
const HIT = "[item] Linen Cloth\nDropped by humanoids.\nMore: https://everloot.app/database/item/2589\nSource: https://warcraft.wiki.gg/wiki/Linen_Cloth (CC-BY-SA-4.0, retrieved 2023-11-13)\n";

const shell: AccountShell = {
  userId: ME, name: "Jaina#1234", handle: "jaina", displayName: "Jaina", status: null, publicProfile: false,
  characters: [{ id: MAGE, name: "Jaina", classSlug: "mage", realm: null }], mainCharacterId: MAGE, activeCharacterId: MAGE,
};

function sse(events: unknown[]): Response {
  const raw = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(new TextEncoder().encode(raw), { status: 200, headers: { "content-type": "text/event-stream" } });
}

type Call = { url: string; init?: RequestInit };
let calls: Call[];
let modelTurns: number;

/** This site and OpenRouter, mocked. The model looks Linen Cloth up once, then answers. */
function api({ signed = true }: { signed?: boolean } = {}) {
  calls = [];
  modelTurns = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "/api/auth/me") return Response.json({ user: signed ? { id: ME, name: "Jaina#1234" } : null });
    if (url === "/api/me/shell") return signed ? Response.json(shell) : Response.json({ error: "Sign in first." }, { status: 401 });
    if (url.startsWith("/schema/mcp/")) return Response.json({ title: "T", inputSchema: { type: "object", properties: {} } });
    if (url.startsWith("/api/tools/")) return Response.json({ text: HIT });
    if (url === "https://openrouter.ai/api/v1/key") return Response.json({ data: {} });
    if (url === "https://openrouter.ai/api/v1/chat/completions") {
      return modelTurns++ === 0
        ? sse([{ model: "deepseek/deepseek-v4.1-flash", choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", type: "function", function: { name: "get_by_name", arguments: "{\"name\":\"Linen Cloth\"}" } }] } }] }])
        : sse([{ choices: [{ delta: { content: "Humanoids drop it." } }] }]);
    }
    throw new Error(`Unexpected request ${url}`);
  }));
}

/** Every request that carries the key anywhere (URL, headers or body) goes to the provider, never to Everloot. */
function keyOnlyToProvider() {
  const carrying = calls.filter((c) => `${c.url} ${JSON.stringify(c.init?.headers ?? {})} ${String(c.init?.body ?? "")}`.includes(KEY));
  for (const c of carrying) expect(new URL(c.url).host).toBe("openrouter.ai");
  for (const c of calls.filter((c) => c.url.startsWith("/"))) expect(JSON.stringify(c)).not.toContain(KEY);
  return carrying.length;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  window.history.replaceState(null, "", "/chat");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const render = async (ui: ReactNode) => { await act(async () => root.render(ui)); await settle(); };
const text = () => container.textContent ?? "";
const button = (label: string) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === label || b.getAttribute("aria-label") === label);
const click = async (el: Element | undefined) => { expect(el).toBeTruthy(); await act(async () => (el as HTMLElement).click()); await settle(); };
const textarea = () => container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your question"]')!;
const saveKey = () => localStorage.setItem(PROVIDERS, JSON.stringify([{ kind: "openrouter", model: "deepseek/deepseek-v4.1-flash", key: KEY }]));

function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = Object.getPrototypeOf(el) as object;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

describe("the chat page", () => {
  test("no key, signed in: one composer that asks to finish key setup in Settings, the account label and four suggestions", async () => {
    api();
    await render(<ChatClient profiles />);
    expect(container.querySelectorAll("textarea")).toHaveLength(1);
    expect(container.querySelector('input[type="password"]')).toBeNull();
    const setup = Array.from(container.querySelectorAll("a")).find((a) => a.textContent === "Finish your key setup");
    expect(setup?.getAttribute("href")).toBe("/settings#chat-keys");
    expect(text()).toContain("Using your Everloot account");
    expect(container.querySelector('select[aria-label="Model"]')).toBeNull();
    for (const s of SUGGESTIONS) expect(button(s)).toBeTruthy();
    expect(SUGGESTIONS).toHaveLength(4);
  });

  test("signed out: setup goes through sign-in, and lookups say they use the public limits", async () => {
    api({ signed: false });
    await render(<ChatClient profiles />);
    const setup = Array.from(container.querySelectorAll("a")).find((a) => a.textContent === "Finish your key setup");
    expect(setup?.getAttribute("href")).toBe("/sign-in?returnTo=%2Fsettings%23chat-keys");
    expect(text()).toContain("Signed out: lookups use the public limits");
    expect(text()).not.toContain("Using your Everloot account");
  });

  test("without /settings (profiles off) the setup opens a keys panel on the page instead", async () => {
    api();
    await render(<ChatClient />);
    expect(Array.from(container.querySelectorAll("a")).some((a) => a.textContent === "Finish your key setup")).toBe(false);
    expect(button("Finish your key setup")).toBeTruthy();
    expect(container.querySelector("dialog")).not.toBeNull();
  });

  test("?q= without a key waits in the box with the character as a chip, and nothing is sent", async () => {
    api();
    window.history.replaceState(null, "", `/chat?q=${encodeURIComponent("Best spec?")}&character=${MAGE}`);
    await render(<ChatClient profiles />);
    expect(textarea().value).toBe("Best spec?");
    expect(text()).toContain("Jaina · Mage");
    expect(calls.some((c) => c.url.startsWith("https://") || c.url.startsWith("/api/tools/"))).toBe(false);
    expect(window.location.search).toBe("");
  });

  test("?q= with a key sends at once with the character's context; the answer is labelled From Everloot; the key goes only to the provider", async () => {
    api();
    saveKey();
    window.history.replaceState(null, "", `/chat?q=${encodeURIComponent("Where does Linen Cloth drop?")}&character=${MAGE}`);
    await render(<ChatClient profiles />);
    const turns = calls.filter((c) => c.url === "https://openrouter.ai/api/v1/chat/completions");
    expect(turns).toHaveLength(2);
    const first = JSON.parse(String(turns[0].init!.body)) as { messages: { role: string; content: string }[] };
    expect(first.messages[0].content).toContain("Everloot's data comes first");
    expect(first.messages.at(-1)!.content).toBe("Where does Linen Cloth drop?\n\nI'm playing Jaina, a Mage.");
    expect(calls.map((c) => c.url)).toContain("/api/tools/get_by_name?name=Linen+Cloth");
    expect(text()).toContain("Humanoids drop it.");
    expect(text()).toContain("From Everloot");
    expect(container.querySelector('a[href="https://everloot.app/database/item/2589"]')?.textContent).toBe("/database/item/2589");
    expect(text()).not.toContain("CC-BY-SA");
    expect(container.querySelector('select[aria-label="Model"]')).not.toBeNull();
    expect(keyOnlyToProvider()).toBe(2);
    expect(textarea().value).toBe("");
  });

  test("conversations: listed in the rail, a new chat starts empty, an old one reopens, and delete removes it", async () => {
    api();
    saveKey();
    await render(<ChatClient profiles />);
    await act(async () => setValue(textarea(), "Where does Linen Cloth drop?"));
    await act(async () => textarea().form!.requestSubmit());
    await settle();
    expect(text()).toContain("Humanoids drop it.");
    keyOnlyToProvider();

    await click(button("Chats"));
    const rail = () => container.querySelector('nav[aria-label="Conversations"]')!;
    expect(rail()).not.toBeNull();
    expect(Array.from(rail().querySelectorAll("li button")).map((b) => b.textContent)).toContain("Where does Linen Cloth drop?");

    await click(Array.from(rail().querySelectorAll("button")).find((b) => b.textContent === "New chat"));
    expect(text()).toContain("What do you want to know about WoW: Forever?");
    expect(text()).not.toContain("Humanoids drop it.");

    await click(Array.from(rail().querySelectorAll("li button")).find((b) => b.textContent === "Where does Linen Cloth drop?"));
    expect(text()).toContain("Humanoids drop it.");

    await click(button("Delete Where does Linen Cloth drop?"));
    expect(rail().querySelectorAll("li")).toHaveLength(0);
    expect(localStorage.getItem("everloot.chat.conversations.v1")).toBeNull();
  });

  test("without a key, Send shows Everloot's search results, labelled and without the raw Source lines", async () => {
    api({ signed: false });
    await render(<ChatClient profiles />);
    await click(button("Where does Linen Cloth drop?"));
    expect(calls.map((c) => c.url)).toContain("/api/tools/search_knowledge?query=Where+does+Linen+Cloth+drop%3F&limit=3");
    expect(text()).toContain("Dropped by humanoids.");
    expect(text()).toContain("From Everloot");
    expect(text()).toContain("Everloot search");
    expect(text()).not.toMatch(/Source: |More: /);
  });

  test("Ctrl+Shift+O starts a new chat", async () => {
    api();
    saveKey();
    await render(<ChatClient profiles />);
    await act(async () => setValue(textarea(), "Where does Linen Cloth drop?"));
    await act(async () => textarea().form!.requestSubmit());
    await settle();
    expect(text()).toContain("Humanoids drop it.");
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "O", ctrlKey: true, shiftKey: true })); });
    await settle();
    expect(text()).toContain("What do you want to know about WoW: Forever?");
  });
});

describe("the Chat keys section", () => {
  test("a key is saved to this browser only, shown masked, tested with its provider alone and removable", async () => {
    api();
    await render(<ChatKeys />);
    expect(text()).toContain("Everloot's servers never receive them");
    const key = container.querySelector<HTMLInputElement>('input[name="key"]')!;
    key.value = KEY;
    await act(async () => key.form!.requestSubmit());
    await settle();
    // Saving makes no request at all.
    expect(calls).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(PROVIDERS)!)).toEqual([{ kind: "openrouter", model: "deepseek/deepseek-v4.1-flash", key: KEY }]);
    expect(container.innerHTML).not.toContain(KEY);
    expect(text()).toContain("ending 1234");
    expect(text()).toContain("Saved in this browser.");

    await click(button("Test"));
    expect(calls.map((c) => c.url)).toEqual(["https://openrouter.ai/api/v1/key"]);
    expect(keyOnlyToProvider()).toBe(1);
    expect(text()).toContain("OpenRouter accepted the key.");

    const model = container.querySelector<HTMLSelectElement>("select:not([name])")!;
    expect(model.closest("label")?.textContent).toContain("Default model");
    await act(async () => setValue(model, "openrouter|qwen/qwen3.7-flash"));
    expect(JSON.parse(localStorage.getItem(PROVIDERS)!)[0].model).toBe("qwen/qwen3.7-flash");

    await click(button("Remove OpenRouter"));
    expect(localStorage.getItem(PROVIDERS)).toBeNull();
  });

  test("a bad paste is refused and nothing is stored", async () => {
    api();
    await render(<ChatKeys />);
    const key = container.querySelector<HTMLInputElement>('input[name="key"]')!;
    key.value = "hunter2";
    await act(async () => key.form!.requestSubmit());
    expect(text()).toContain("That does not look like the right key");
    expect(localStorage.getItem(PROVIDERS)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
