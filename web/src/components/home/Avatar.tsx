// The player's initials on their main character's class colour; the accent with no main character.
// Written out in full so Tailwind can see each class name.
const CLASS_BG: Record<string, string> = {
  warrior: "bg-class-warrior", paladin: "bg-class-paladin", hunter: "bg-class-hunter",
  rogue: "bg-class-rogue", priest: "bg-class-priest", shaman: "bg-class-shaman",
  mage: "bg-class-mage", warlock: "bg-class-warlock", druid: "bg-class-druid",
};

/** Up to two letters: the first of each of the first two words. */
export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => Array.from(w)[0] ?? "").join("").toUpperCase() || "?";

export default function Avatar({ name, classSlug, size = 40 }: { name: string; classSlug: string | null; size?: number }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-canvas ${(classSlug && CLASS_BG[classSlug]) || "bg-accent"}`}>
      {initials(name)}
    </span>
  );
}
