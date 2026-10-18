import { CREDIT } from "@/lib/talents/assets";

// The credit the data policy asks for on every page that shows Blizzard's art, with the build. The same
// words as the talent calculator's. A page renders it only when it shows at least one file.
export default function GameCredit({ version, label, what = "Icons and text" }: { version: string; label: string; what?: string }) {
  return (
    <p className="text-xs text-muted" data-game-credit>
      {CREDIT} {what} from game build {version}, {label}.
    </p>
  );
}
