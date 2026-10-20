"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LAUNCH, LAUNCH_AT, longDate } from "@/data/wow-forever";

/** Days, hours and minutes until `at`, or null once it has passed. */
export function timeLeft(now: number, at = Date.parse(LAUNCH_AT)): { days: number; hours: number; minutes: number } | null {
  const ms = at - now;
  if (ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * "WoW: Forever launches in 17 days, 16 hours" on the home page. The server renders the plain date so
 * the line is right without JavaScript and hydration never disagrees; the browser then counts down
 * by the minute. After launch it renders nothing.
 */
export default function LaunchCountdown({ initialNow }: { initialNow?: number }) {
  const [now, setNow] = useState<number | null>(initialNow ?? null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const left = now === null ? undefined : timeLeft(now);
  if (left === null) return null;
  const when = left
    ? `in ${left.days > 0 ? `${plural(left.days, "day")}, ${plural(left.hours, "hour")}` : `${plural(left.hours, "hour")}, ${plural(left.minutes, "minute")}`}`
    : `on ${longDate(LAUNCH.date)}, 3:00 p.m. PST`;
  return (
    // fg-2, not muted: the line sits on the hero's art.
    <p className="font-mono text-xs text-fg-2">
      <Link href="/wow-forever" className="hover:text-accent transition">
        WoW: Forever launches <time dateTime={LAUNCH_AT} className="text-fg">{when}</time>
      </Link>
    </p>
  );
}
