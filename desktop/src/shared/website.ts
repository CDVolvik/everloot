/**
 * The site's pages the sidebar links to. They open in the player's browser, not inside the app:
 * the site is where its tools live (and where its ads pay for it), and the Chat page already
 * answers what the database and lore archive would. The source tag lets the site's analytics
 * count visits that came from the app.
 */
export const WEBSITE_LINKS: { label: string; path: string }[] = [
  { label: "Database", path: "/database" },
  { label: "Talent calculator", path: "/tools/talents" },
  { label: "Raid builder", path: "/tools/raid" },
  { label: "Auction prices", path: "/tools/auctions" },
];

export function websiteUrl(endpoint: string, path: string): string {
  const url = new URL(path, endpoint);
  url.searchParams.set("utm_source", "desktop-app");
  url.searchParams.set("utm_medium", "app");
  return url.toString();
}
