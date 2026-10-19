import Link from "next/link";
import AgreementMeter from "./AgreementMeter";

export interface EmptyStateProps {
  /** One sentence: what is missing and why it will come. "Nobody has looted this in Forever yet." */
  message: string;
  /** Installs that have reported it so far; usually 0. */
  count?: number;
  /** The one action. Getting the addon unless the page has a better one. */
  action?: { href: string; label: string };
  /** Drop the frame when the empty state sits inside a Card or a DataTable that already draws one. */
  framed?: boolean;
}

export const GET_THE_ADDON = { href: "/addon", label: "Get the addon" } as const;

/**
 * Every empty dataset looks like this: the agreement meter at its count, one sentence and one
 * action. Never a bare "0", never an empty box.
 */
export default function EmptyState({ message, count = 0, action = GET_THE_ADDON, framed = true }: EmptyStateProps) {
  return (
    <div
      data-empty-state
      className={`flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6 ${framed ? "rounded-card border border-line bg-panel p-6" : "px-4 py-8 sm:px-6"}`}
    >
      <AgreementMeter count={count} size="lg" />
      <p className="min-w-0 flex-1 text-fg-2">{message}</p>
      <Link href={action.href} className="btn btn-primary shrink-0">{action.label}</Link>
    </div>
  );
}
