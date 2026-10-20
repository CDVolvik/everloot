// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test } from "vitest";
import Tabs, { tabFromHash, type TabItem } from "./Tabs";

const TABS: TabItem[] = [
  { id: "created-by", label: "Created by", count: 1, panel: <p>Blacksmithing</p> },
  { id: "dropped-by", label: "Dropped by", count: 0, panel: <p>Nobody yet</p> },
  { id: "sources", label: "Sources", panel: <p>Game files</p> },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/database/items/7960");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const tabs = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
const selected = () => tabs().find((t) => t.getAttribute("aria-selected") === "true")?.textContent;
const visiblePanel = () => container.querySelector('[role="tabpanel"]:not([hidden])')?.textContent;

test("the server opens the first tab, and the others are hidden panels", () => {
  const html = renderToStaticMarkup(<Tabs label="Item relations" tabs={TABS} />);
  expect(html).toContain('role="tablist" aria-label="Item relations"');
  expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
  expect(html.match(/hidden=""/g)).toHaveLength(2);
});

test("a hash in the address opens its tab", async () => {
  window.history.replaceState(null, "", "/database/items/7960#dropped-by");
  await act(async () => root.render(<Tabs label="Item relations" tabs={TABS} />));
  expect(selected()).toBe("Dropped by0");
  expect(visiblePanel()).toBe("Nobody yet");
});

test("an unknown hash leaves the first tab open", async () => {
  window.history.replaceState(null, "", "/database/items/7960#nope");
  await act(async () => root.render(<Tabs label="Item relations" tabs={TABS} />));
  expect(selected()).toBe("Created by1");
});

test("a click opens the tab and writes its hash", async () => {
  await act(async () => root.render(<Tabs label="Item relations" tabs={TABS} />));
  await act(async () => tabs()[2].click());
  expect(selected()).toBe("Sources");
  expect(visiblePanel()).toBe("Game files");
  expect(window.location.hash).toBe("#sources");
});

test("arrow keys, Home and End move between tabs and focus follows", async () => {
  await act(async () => root.render(<Tabs label="Item relations" tabs={TABS} />));
  const key = (k: string) => act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });
  tabs()[0].focus();
  await key("ArrowRight");
  expect(selected()).toBe("Dropped by0");
  expect(document.activeElement).toBe(tabs()[1]);
  await key("End");
  expect(selected()).toBe("Sources");
  await key("ArrowRight");
  expect(selected()).toBe("Created by1");
  await key("ArrowLeft");
  expect(selected()).toBe("Sources");
  await key("Home");
  expect(selected()).toBe("Created by1");
});

test("only the open tab is in the tab order", async () => {
  await act(async () => root.render(<Tabs label="Item relations" tabs={TABS} />));
  expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
});

test("the hash changing later switches the tab", async () => {
  await act(async () => root.render(<Tabs label="Item relations" tabs={TABS} />));
  await act(async () => {
    window.history.replaceState(null, "", "#sources");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(selected()).toBe("Sources");
});

test("tabFromHash", () => {
  expect(tabFromHash("#sources", ["a", "sources"])).toBe("sources");
  expect(tabFromHash("", ["a"])).toBeNull();
  expect(tabFromHash("#x", ["a"])).toBeNull();
});
