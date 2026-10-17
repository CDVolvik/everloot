import { CARD_SIZE, renderCard } from "@/lib/og-card";

export const alt = "WoW Forever World Map on Everloot";
export const size = CARD_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderCard({ label: "Everloot", title: "WoW Forever World Map", subtitle: "Zones and dungeon and raid entrances, drawn by us from game files" });
}
