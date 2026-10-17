import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { tokens } from "@/design/tokens";

// Social preview for shared links: the wordmark and the site's title on the dark canvas.
// Wording mirrors the layout metadata; no figures, so it can never overstate the data.
export const alt = "Everloot — WoW: Forever database, guild tracker and tools";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The image is prerendered at build, so the fonts are read from the geist package then.
const fonts = join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans");

export default async function OpenGraphImage() {
  const [bold, regular] = await Promise.all([
    readFile(join(fonts, "Geist-Bold.ttf")),
    readFile(join(fonts, "Geist-Regular.ttf")),
  ]);
  const c = tokens.dark;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "80px", background: c.canvas, color: c.fg, fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <svg width="96" height="96" viewBox="8 8 48 48">
            <path d="M32 12 52 32 32 52 12 32Z" fill="none" stroke={c.accent} strokeWidth="5" strokeLinejoin="round" />
          </svg>
          <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: -4 }}>everloot</div>
        </div>
        <div style={{ fontSize: 38, marginTop: 24, color: c["fg-2"] }}>Database, guild tracker and tools from addon uploads</div>
        <div style={{ fontSize: 28, marginTop: 48, color: c.muted }}>everloot.app</div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: bold, weight: 700, style: "normal" },
        { name: "Geist", data: regular, weight: 400, style: "normal" },
      ],
    },
  );
}
