import { NextResponse } from "next/server";
import { sharingStore } from "@/lib/upload-store";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.get("authorization") ?? "");
  if (!match) return NextResponse.json({ ok: false, error: "A verification grant is required." }, { status: 401 });
  const action = new URL(req.url).searchParams.get("action");
  if (action !== "revoke" && action !== "opt-out") return NextResponse.json({ ok: false, error: "Choose revoke or opt-out." }, { status: 400 });
  try {
    const done = action === "revoke" ? await sharingStore.revoke(match[1]) : await sharingStore.optOut(match[1]);
    return NextResponse.json({ ok: done, ...(done ? {} : { error: "Grant not found or not a character grant." }) }, { status: done ? 200 : 403, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Withdrawal could not be confirmed. Retry in a moment." }, { status: 503 });
  }
}
