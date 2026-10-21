import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/components/ApiKeys", () => ({ default: () => <div>api keys</div> }));
vi.mock("@/lib/auth/auth", () => ({ authV2Enabled: () => false, getAuth: () => { throw new Error("unused"); } }));
vi.mock("@/lib/saved-builds", async (importOriginal) => ({ ...(await importOriginal<object>()), savedBuildsOn: () => false }));
vi.mock("@/lib/supabase/server", () => ({ getUser: async () => ({ id: "11111111-2222-4333-8444-555555555555", name: "Thrall#1234" }) }));

import AccountPage from "./page";

test("Chat keys has its own section on /account, the target of chat's key setup, and says keys stay in the browser", async () => {
  const html = renderToStaticMarkup(await AccountPage());
  expect(html).toMatch(/<section id="chat-keys"[^>]*><h2 id="chat-keys-heading"[^>]*>Chat keys<\/h2>/);
  expect(html).toContain("Everloot&#x27;s servers never receive them");
  expect(html).toContain('id="keys"');
});
