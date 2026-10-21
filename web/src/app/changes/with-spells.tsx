import Link from "next/link";
import SpellTip from "@/components/game/SpellTip";
import { splitMentions, type MentionIndex } from "@/lib/spell-mentions";

/** Text with the spells it names given their icon and tooltip, linked to the page that shows them. Without the art, the text as it was. */
export default function WithSpells({ text, index }: { text: string; index: MentionIndex }) {
  return (
    <>
      {splitMentions(text, index).map((p, i) => (typeof p === "string" ? p : (
        <SpellTip key={i} tip={p.mention.tip}>
          <Link href={p.mention.href} className="text-accent hover:underline underline-offset-4">{p.text}</Link>
        </SpellTip>
      )))}
    </>
  );
}
