import { NextResponse } from "next/server";
import { openApiDocument } from "@/lib/openapi";

/**
 * GET /api/openapi.json: the OpenAPI 3.1 description of the JSON API, assembled at build time from the
 * protocol's route catalogue and response schemas (web/src/lib/openapi.ts). Static: it changes only with
 * a deploy, so the CDN may keep it for a day.
 */
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(openApiDocument(), {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
