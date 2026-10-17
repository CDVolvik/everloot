/**
 * What /wow-forever says about the launch, and where it comes from. The quote is Blizzard's own sentence;
 * nothing else on the page is attributed to the source. web/src/data/wow-forever.test.ts checks that the
 * source link and date agree with the curated lore row (kb/curated/forever.yaml).
 */
export const LAUNCH = {
  quote: "World of Warcraft: Forever launches globally on November 4, 2026, at 3:00 p.m. PST",
  /** The date inside the quote, ISO form. */
  date: "2026-11-04",
  sourceTitle: "[Updated 9/24] Pre-Purchase the World of Warcraft®: Forever Collector’s Edition",
  sourceName: "Blizzard News",
  sourceUrl: "https://news.blizzard.com/en-us/article/24302498/updated-9-24-pre-purchase-the-world-of-warcraft-forever-collectors-edition",
  /** The day a person read the source and found this sentence in it. Update it when the source is read again. */
  checkedOn: "2026-10-17",
} as const;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "October 17, 2026" from an ISO date, without a time zone shifting the day. */
export const longDate = (iso: string): string => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
