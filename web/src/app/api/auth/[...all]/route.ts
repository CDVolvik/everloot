import { toNextJsHandler } from "better-auth/next-js";
import { authV2Enabled, getAuth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

// Better Auth serves /api/auth/callback/battlenet and its other paths here. The static routes next
// to this folder (bnet, bnet/callback, me, logout) win over a catch-all, so they are unaffected.
// The auth instance is built per request, never at import: the build imports this module without env.
function serve(method: "GET" | "POST") {
  return (request: Request) =>
    authV2Enabled() ? toNextJsHandler(getAuth())[method](request) : Promise.resolve(new Response(null, { status: 404 }));
}

export const GET = serve("GET");
export const POST = serve("POST");
