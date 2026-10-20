import { CREDIT } from "@/lib/talents/assets";

// The credit the data policy asks for on every page that shows Blizzard's art, with the build. The same
// words as the talent calculator's. A page renders it only when it shows at least one file.
// `as="span"` puts it inside the page's SourceLine.
export default function GameCredit({ version, label, what = "Icons and text", as: Tag = "p" }: { version: string; label: string; what?: string; as?: "p" | "span" }) {
  return (
    <Tag className={Tag === "p" ? "text-xs text-muted" : undefined} data-game-credit>
      {CREDIT} {what} from game build {version}, {label}.
    </Tag>
  );
}
