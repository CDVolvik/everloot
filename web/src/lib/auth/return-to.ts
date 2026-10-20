/**
 * Where a visitor goes back to after signing in. Only a path on this site: it starts with one slash, has no
 * backslash or control character, and is not too long, so a crafted link cannot send anyone elsewhere.
 */
export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

/** The sign-in page, coming back to `returnTo` afterwards. */
export function signInPath(returnTo: string): string {
  const safe = safeReturnTo(returnTo);
  return safe ? `/sign-in?returnTo=${encodeURIComponent(safe)}` : "/sign-in";
}

/** The cookie that carries the return path through a Battle.net sign-in on the first sign-in flow. */
export const RETURN_COOKIE = "everloot_return_to";
