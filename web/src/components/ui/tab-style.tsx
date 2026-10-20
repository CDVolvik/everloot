// The look Tabs and LinkTabs share. Kept out of Tabs.tsx, a client module, so the server-rendered
// LinkTabs can call it.

/** One tab: 32 px tall with 13 px text (40 px on a phone), the accent underline when open, quieter when empty. */
export const tabClass = (on: boolean, empty: boolean) =>
  `inline-flex min-h-control-sm shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-control font-medium transition-colors sm:min-h-control ${
    on ? "border-accent text-fg" : `border-transparent hover:text-fg ${empty ? "text-muted" : "text-fg-2"}`}`;

/** "Dropped by (3)": the count beside the label, as data pages list it. */
export function TabCount({ count }: { count: number }) {
  // The space is for the text a screen reader or a copy gets; in the flex row the margin draws it.
  return <span className="ml-1 tabular-nums text-muted">{` (${count})`}</span>;
}
