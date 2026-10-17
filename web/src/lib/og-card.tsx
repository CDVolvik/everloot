import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { tokens } from "@/design/tokens";

/** Size every per-route social card shares with the site-wide one. */
export const CARD_SIZE = { width: 1200, height: 630 };

// Read from the geist package when the image is prerendered at build.
const fonts = join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans");

/**
 * A text-only social card on the brand canvas: the diamond mark, a small label, the page title and one
 * line under it. Nothing from the game, so no Blizzard art can end up in a shared link.
 */
export async function renderCard(card: { label: string; title: string; subtitle: string }): Promise<ImageResponse> {
  const [bold, regular] = await Promise.all([readFile(join(fonts, "Geist-Bold.ttf")), readFile(join(fonts, "Geist-Regular.ttf"))]);
  const c = tokens.dark;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px", background: c.canvas, color: c.fg, fontFamily: "Geist" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="56" height="56" viewBox="8 8 48 48">
            <path d="M32 12 52 32 32 52 12 32Z" fill="none" stroke={c.accent} strokeWidth="5" strokeLinejoin="round" />
          </svg>
          <div style={{ fontSize: 40, fontWeight: 700, color: c.accent }}>{card.label}</div>
        </div>
        <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2, marginTop: 40, lineHeight: 1.05 }}>{card.title}</div>
        <div style={{ fontSize: 36, marginTop: 28, color: c["fg-2"] }}>{card.subtitle}</div>
        <div style={{ fontSize: 28, marginTop: 56, color: c.muted }}>everloot.app</div>
      </div>
    ),
    { ...CARD_SIZE, fonts: [{ name: "Geist", data: bold, weight: 700, style: "normal" }, { name: "Geist", data: regular, weight: 400, style: "normal" }] },
  );
}
