import { NextResponse } from "next/server";
import { CLIENT_LAYER } from "@/lib/edges";
import { recordUsage } from "@/lib/usage-metrics";

/**
 * GET /api/edges/client-layer: the whole game-file relation layer of the current build, as committed in
 * web/src/data/game-data/client-layer.json. Blizzard's data, found in game files, unconfirmed: it carries
 * the game-data notice, not Everloot's CC BY-SA headers. The same file is public in the repository, so it
 * is not paged or limited.
 */
export const dynamic = "force-static";

export async function GET() {
  recordUsage("api.edges_client_layer");
  return NextResponse.json(CLIENT_LAYER, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "X-Everloot-Game-Build": CLIENT_LAYER.build.version,
      // Headers stay ASCII; the full notice with the copyright sign is the file's own `credit`.
      "X-Everloot-Game-Data": "Blizzard Entertainment game data, found in game files, unconfirmed; not under Everloot's licence",
    },
  });
}
