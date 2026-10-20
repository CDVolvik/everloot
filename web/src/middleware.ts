import { NextResponse, type NextRequest } from "next/server";
import { HOME_REWRITE_HEADER, profilesOn } from "@/lib/profiles";

/**
 * `/` stays the cached landing page for visitors. With EVERLOOT_PROFILES on and a session cookie, it is
 * rewritten to the signed-in home (/home), which checks the session itself: a stale cookie gets the landing.
 */

/** The legacy Battle.net session and Better Auth's (cookiePrefix "everloot"; "__Secure-" in production). */
export const SESSION_COOKIES = ["everloot_session", "everloot.session_token", "__Secure-everloot.session_token"] as const;

export function middleware(req: NextRequest) {
  if (!profilesOn() || !SESSION_COOKIES.some((name) => req.cookies.get(name)?.value)) return NextResponse.next();
  const headers = new Headers(req.headers);
  headers.set(HOME_REWRITE_HEADER, "1");
  return NextResponse.rewrite(new URL("/home", req.url), { request: { headers } });
}

export const config = { matcher: "/" };
