import { NextResponse } from "next/server";
import { cleanLabel, createKey, KEYS_PER_ACCOUNT, listKeys, revokeKey, validKeyId } from "@/lib/api-keys";
import { guardOn } from "@/lib/data-guard";
import { getUser, siteUrl } from "@/lib/supabase/server";

/**
 * The signed-in player's free API keys: GET lists them, POST makes one (shown once), DELETE ?id= revokes
 * one. Battle.net sign-in is the identity; nothing works until EVERLOOT_DATA_GUARD=1.
 */
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers });

async function account(req: Request, write: boolean) {
  if (!guardOn()) return fail(503, "API keys are not switched on yet.");
  const origin = req.headers.get("origin");
  if (write && origin && origin !== siteUrl()) return fail(403, "Invalid origin");
  const user = await getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in with Battle.net to manage keys.", signIn: "/api/auth/bnet" }, { status: 401, headers });
  return user;
}

export async function GET(req: Request) {
  try {
    const user = await account(req, false);
    if (user instanceof Response) return user;
    return NextResponse.json({ ok: true, keys: await listKeys(user.id), limit: KEYS_PER_ACCOUNT }, { headers });
  } catch {
    return fail(503, "Keys are temporarily unavailable.");
  }
}

export async function POST(req: Request) {
  try {
    const user = await account(req, true);
    if (user instanceof Response) return user;
    let body: unknown = {};
    try { body = await req.json(); } catch {}
    const made = await createKey(user.id, cleanLabel((body as { label?: unknown } | null)?.label));
    if (!made) return fail(409, `You already have ${KEYS_PER_ACCOUNT} keys. Revoke one first.`);
    return NextResponse.json({ ok: true, ...made }, { status: 201, headers });
  } catch {
    return fail(503, "Keys are temporarily unavailable.");
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await account(req, true);
    if (user instanceof Response) return user;
    const id = new URL(req.url).searchParams.get("id");
    if (!validKeyId(id)) return fail(400, "Give the id of the key to revoke.");
    if (!(await revokeKey(user.id, id))) return fail(404, "No live key with that id on this account.");
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return fail(503, "Keys are temporarily unavailable.");
  }
}
