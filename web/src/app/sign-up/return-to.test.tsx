// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); } }));
const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser: auth.getUser, siteUrl: () => "https://everloot.app" }));

import SignInPage from "../sign-in/page";
import SignUpPage from "./page";
import EmailAuthForm from "@/components/EmailAuthForm";

const BACK = "/tools/talents/mage?save=1";
const query = (returnTo: string) => ({ searchParams: Promise.resolve({ returnTo }) });

beforeEach(() => {
  vi.stubEnv("BNET_CLIENT_ID", "client");
  vi.stubEnv("BNET_CLIENT_SECRET", "secret");
  vi.stubEnv("EVERLOOT_AUTH_V2", "1");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "Everloot <hello@everloot.app>");
  auth.getUser.mockReset().mockResolvedValue(null);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

test("the way back from Save survives the step from sign-in to sign-up", async () => {
  const signIn = renderToStaticMarkup(await SignInPage(query(BACK)));
  expect(signIn).toContain(`href="/sign-up?returnTo=${encodeURIComponent(BACK)}"`);
  const signUp = renderToStaticMarkup(await SignUpPage(query(BACK)));
  expect(signUp).toContain(`href="/api/auth/bnet?returnTo=${encodeURIComponent(BACK)}"`);
  expect(signUp).toContain(`href="/sign-in?returnTo=${encodeURIComponent(BACK)}"`);
  // Another site is never a way back.
  const hostile = renderToStaticMarkup(await SignUpPage(query("//evil.example")));
  expect(hostile).toContain('href="/api/auth/bnet"');
  expect(hostile).not.toContain("evil.example");
  auth.getUser.mockResolvedValue({ id: "u", name: "Thrall" });
  await expect(SignUpPage(query(BACK))).rejects.toThrow(`NEXT_REDIRECT ${BACK}`);
});

test("a new account's confirmation link brings the player back to the build", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let sent: Record<string, unknown> = {};
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return Response.json({}); });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<EmailAuthForm mode="sign-up" returnTo={BACK} />));
  const set = (name: string, value: string) => { container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value = value; };
  set("name", "Jaina");
  set("email", "jaina@example.com");
  set("password", "kul-tiras-forever");
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(sent).toMatchObject({ email: "jaina@example.com", callbackURL: BACK });
  await act(async () => root.unmount());
  container.remove();
});
