import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
const auth = vi.hoisted(() => ({ getUser: vi.fn(), authQuery: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser: auth.getUser, authQuery: auth.authQuery, siteUrl: () => "https://everloot.app" }));

import PublicProfilePage, { generateMetadata } from "./page";

const params = (handle: string) => ({ params: Promise.resolve({ handle }) });
let row: Record<string, unknown> | null;

beforeEach(() => {
  vi.stubEnv("EVERLOOT_PROFILES", "1");
  row = {
    handle: "thrall", display_name: "Go'el", status_emoji: "🔥", status_text: "Farming MC",
    characters: [{ name: "Jaina", class_slug: "mage", realm: "Pioneer", main: false }, { name: "Thrall", class_slug: "warrior", realm: null, main: true }],
    builds: [{ slug: "Frost123", name: "Raid frost", class_slug: "mage", updated_at: "2026-10-20T12:00:00+00:00" }],
  };
  auth.getUser.mockReset();
  auth.authQuery.mockReset().mockImplementation(async () => (row ? [row] : []));
});
afterEach(() => { vi.unstubAllEnvs(); });

test("off, unknown, not public or malformed: a 404 with noindex", async () => {
  vi.stubEnv("EVERLOOT_PROFILES", "");
  await expect(PublicProfilePage(params("thrall"))).rejects.toThrow("NEXT_NOT_FOUND");
  expect(auth.authQuery).not.toHaveBeenCalled();
  vi.stubEnv("EVERLOOT_PROFILES", "1");
  row = null;
  await expect(PublicProfilePage(params("thrall"))).rejects.toThrow("NEXT_NOT_FOUND");
  expect((await generateMetadata(params("thrall"))).robots).toEqual({ index: false, follow: false });
  auth.authQuery.mockClear();
  await expect(PublicProfilePage(params("th%20rall"))).rejects.toThrow("NEXT_NOT_FOUND");
  expect(auth.authQuery).not.toHaveBeenCalled();
  auth.authQuery.mockRejectedValue(new Error("down"));
  await expect(PublicProfilePage(params("thrall"))).rejects.toThrow("NEXT_NOT_FOUND");
});

test("public: indexed, with the characters, shared builds and status the owner ticked, never their sign-in name", async () => {
  const metadata = await generateMetadata(params("Thrall"));
  expect(metadata.robots).toBeUndefined();
  expect(metadata.alternates?.canonical).toBe("/u/thrall");
  expect(JSON.parse(auth.authQuery.mock.calls[0][1].body)).toEqual({ p_handle: "Thrall" });
  const html = renderToStaticMarkup(await PublicProfilePage(params("thrall"))).replace(/&#x27;/g, "'");
  expect(html).toContain("Go'el");
  expect(html).toContain("@thrall");
  expect(html).toContain("🔥 Farming MC");
  expect(html).toMatch(/text-class-warrior">Thrall<\/span><span data-badge="neutral"[^>]*>Main</);
  expect(html).toContain("Pioneer");
  expect(html).toContain('href="/b/Frost123"');
  expect(html).toContain("Raid frost");
  expect(auth.getUser).not.toHaveBeenCalled();
  expect(html).not.toMatch(/#\d{3,}|BattleTag|@everloot|email/i);
});

test("what the owner hides is not shown", async () => {
  row = { ...row, status_emoji: null, status_text: null, characters: null, builds: null, display_name: null };
  const html = renderToStaticMarkup(await PublicProfilePage(params("thrall")));
  expect(html).toContain("@thrall");
  expect(html).not.toContain("Characters");
  expect(html).not.toContain("Shared builds");
  expect(html).toContain("Nothing shared here yet.");
});
