import { CARD_SIZE, renderCard } from "@/lib/og-card";

export const alt = "WoW Forever patch notes and Blizzard posts on Everloot";
export const size = CARD_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderCard({ label: "Everloot", title: "WoW Forever Patch Notes and Blizzard Posts", subtitle: "New builds, hotfixes and blue posts, with links to the originals" });
}
