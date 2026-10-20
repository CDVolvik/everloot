import { CREDIT } from "@/lib/talents/assets";

// The credit the data policy asks for on every page that shows Blizzard's art, with the build. The same
// words as the talent calculator's. A page renders it only when it shows at least one file.
// `inline` renders it as a span, for a page that carries it inside its one SourceLine. Inline, `label` is
// optional: leave it out when that line already says "from game files, unconfirmed", and pass it when the
// line says something else (a "Confirmed by players" line still needs the icons labelled unconfirmed).
export default function GameCredit({ version, label, what = "Icons and text", inline = false }: { version: string; label?: string; what?: string; inline?: boolean }) {
  if (inline) return <span data-game-credit>{`${CREDIT} ${what} from game build ${version}${label ? `, ${label}` : ""}.`}</span>;
  return (
    <p className="text-xs text-muted" data-game-credit>
      {CREDIT} {what} from game build {version}, {label}.
    </p>
  );
}
