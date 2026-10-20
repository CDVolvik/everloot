import Link from "next/link";
import type { ReactNode } from "react";

export interface CardProps {
  /** A card that is one link: the whole card is the target, and its border answers the pointer. */
  href?: string;
  /** Dashed edge: what the card shows comes from the game files and no player has confirmed it. */
  unconfirmed?: boolean;
  /** `none` for a card whose content (a table, a list with its own rows) runs to the edge. */
  padding?: "default" | "none";
  as?: "div" | "section" | "article" | "li";
  className?: string;
  "aria-labelledby"?: string;
  children: ReactNode;
}

/** The one card: panel fill, hairline edge, 12 px corners, no shadow. */
export default function Card({ href, unconfirmed = false, padding = "default", as: Tag = "div", className = "", children, ...aria }: CardProps) {
  const classes = [
    "block min-w-0 rounded-card border bg-panel",
    unconfirmed ? "border-dashed border-edge" : "border-line",
    padding === "default" ? "p-6" : "overflow-hidden",
    href ? "transition-colors hover:border-accent" : "",
    className,
  ].filter(Boolean).join(" ");
  if (href) return <Link href={href} className={classes} data-card {...aria}>{children}</Link>;
  return <Tag className={classes} data-card {...aria}>{children}</Tag>;
}
