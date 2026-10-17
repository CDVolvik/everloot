import { CARD_SIZE, renderCard } from "@/lib/og-card";

export const alt = "WoW Forever Raid Buff Planner on Everloot";
export const size = CARD_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderCard({ label: "Everloot", title: "WoW Forever Raid Buff Planner", subtitle: "Which buffs and debuffs a 10, 20 or 40 player raid covers" });
}
