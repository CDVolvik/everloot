import { llmsFullTxt } from "@/lib/llms";

/** The long version of /llms.txt, generated the same way. */
export const dynamic = "force-static";
export const revalidate = 3600;

export function GET(): Response {
  return new Response(llmsFullTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" } });
}
