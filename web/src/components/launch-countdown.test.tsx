import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>,
}));

import LaunchCountdown, { timeLeft } from "./LaunchCountdown";
import { LAUNCH_AT } from "@/data/wow-forever";

const at = Date.parse(LAUNCH_AT);
const H = 3_600_000;

test("timeLeft splits the wait into days, hours and minutes, and ends at launch", () => {
  expect(timeLeft(at - (17 * 24 + 16) * H - 55 * 60_000)).toEqual({ days: 17, hours: 16, minutes: 55 });
  expect(timeLeft(at - 59_999)).toEqual({ days: 0, hours: 0, minutes: 0 });
  expect(timeLeft(at)).toBeNull();
  expect(timeLeft(at + H)).toBeNull();
});

test("the server render shows the plain date and links to /wow-forever", () => {
  const html = renderToStaticMarkup(<LaunchCountdown />);
  expect(html).toContain('href="/wow-forever"');
  expect(html).toContain("WoW: Forever launches");
  expect(html).toContain("on November 4, 2026, 3:00 p.m. PST");
  expect(html).toContain(`dateTime="${LAUNCH_AT}"`);
});

test("with a clock it counts down, switches to hours on the last day, and disappears after launch", () => {
  expect(renderToStaticMarkup(<LaunchCountdown initialNow={at - (2 * 24 + 1) * H} />)).toContain("in 2 days, 1 hour");
  expect(renderToStaticMarkup(<LaunchCountdown initialNow={at - 5 * H - 60_000} />)).toContain("in 5 hours, 1 minute");
  expect(renderToStaticMarkup(<LaunchCountdown initialNow={at + 1} />)).toBe("");
});
