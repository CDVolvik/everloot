import { createMount } from "@/lib/mcp-mount";

/** Bearer-token MCP for trusted clients (option A in the hosting memo). The public read-only mount is /mcp/public. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const mount = createMount({ path: "/mcp", bearer: true });

export const POST = mount;
export const GET = mount;
export const OPTIONS = mount;
