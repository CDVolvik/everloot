import { ImageResponse } from "next/og";

// Social preview for shared links: the site's own title on its abyss canvas, in WoW gold.
// Wording mirrors the layout metadata; no figures, so it can never overstate the data.
export const alt = "Everloot — WoW: Forever database, guild tracker and tools";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "80px", background: "#0B0B12", color: "#F4F1EA",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 6, color: "#de911d", textTransform: "uppercase" }}>WoW: Forever</div>
        <div style={{ fontSize: 120, fontWeight: 700, color: "#f0b429", marginTop: 12 }}>Everloot</div>
        <div style={{ fontSize: 38, marginTop: 16 }}>Database, guild tracker and tools from addon uploads</div>
        <div style={{ display: "flex", marginTop: 48, height: 6, width: 160, background: "#8B5CF6" }} />
        <div style={{ fontSize: 28, marginTop: 24, color: "#F4F1EA", opacity: 0.7 }}>everloot.app</div>
      </div>
    ),
    size,
  );
}
