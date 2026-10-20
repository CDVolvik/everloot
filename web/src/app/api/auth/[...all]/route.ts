import { authV2Enabled, getAuth } from "@/lib/auth/auth";
import { siteUrl } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Only the Better Auth paths a browser has to reach. Everything else it serves (update-user,
// get-session, sign-out, …) stays unreachable, and its rate limiter never runs for them. The sign-in
// start and sign-out reach Better Auth from /api/auth/bnet and /api/auth/logout, server side. The
// static routes next to this folder (bnet, bnet/callback, me, logout) win over a catch-all.
// The auth instance is built per request, never at import: the build imports this module without env.
const PUBLIC_GET_PATHS = new Set(["/api/auth/callback/battlenet", "/api/auth/error", "/api/auth/verify-email"]);
// The link in a reset email; Better Auth checks the token and sends the browser on to /reset-password.
const RESET_LINK = /^\/api\/auth\/reset-password\/[^/]+$/;
// The email forms. Better Auth answers these with 4xx while email sign-up is off (no Resend key).
const PUBLIC_POST_PATHS = new Set([
  "/api/auth/sign-up/email", "/api/auth/sign-in/email", "/api/auth/send-verification-email",
  "/api/auth/request-password-reset", "/api/auth/reset-password",
]);

const notFound = () => new Response(null, { status: 404 });

export async function GET(request: Request) {
  const { pathname } = new URL(request.url);
  if (!authV2Enabled() || !(PUBLIC_GET_PATHS.has(pathname) || RESET_LINK.test(pathname))) return notFound();
  return getAuth().handler(request);
}

export async function POST(request: Request) {
  if (!authV2Enabled() || !PUBLIC_POST_PATHS.has(new URL(request.url).pathname)) return notFound();
  // Only our own pages post these forms.
  if (request.headers.get("origin") !== siteUrl()) return Response.json({ error: "Invalid origin" }, { status: 403 });
  return getAuth().handler(request);
}
