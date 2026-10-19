import { authV2Enabled, getAuth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

// Only the two Better Auth paths a browser has to reach. Everything else it serves (update-user,
// get-session, sign-out, …) stays unreachable, and its rate limiter never runs for them. The sign-in
// start and sign-out reach Better Auth from /api/auth/bnet and /api/auth/logout, server side. The
// static routes next to this folder (bnet, bnet/callback, me, logout) win over a catch-all.
// The auth instance is built per request, never at import: the build imports this module without env.
const PUBLIC_PATHS = new Set(["/api/auth/callback/battlenet", "/api/auth/error"]);

const notFound = () => new Response(null, { status: 404 });

export async function GET(request: Request) {
  if (!authV2Enabled() || !PUBLIC_PATHS.has(new URL(request.url).pathname)) return notFound();
  return getAuth().handler(request);
}

// Nothing a browser posts here is Better Auth's to answer.
export async function POST(_request: Request) {
  return notFound();
}
