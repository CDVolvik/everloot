import { NextResponse } from "next/server";
import { validId } from "@/lib/saved-builds";
import { deleteBuild, fail, meAccount, NO_STORE, unavailable } from "@/lib/saved-builds-store";

/** DELETE /api/me/builds/<id>: deletes one of the player's builds. Its short link stops working at once. */
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await meAccount(req, true);
    if (user instanceof Response) return user;
    const { id } = await params;
    if (!validId(id)) return fail(400, "That build id is not valid.");
    if (!(await deleteBuild(user.id, id))) return fail(404, "No build with that id on this account.");
    return NextResponse.json({ deleted: id }, { headers: NO_STORE });
  } catch {
    return unavailable();
  }
}
