const LIMIT = 1200;
const FENCE = "`".repeat(3);

/** Release notes as plain text: markdown marks and HTML removed, and an ellipsis when cut. */
export function plainNotes(markdown: unknown, max = LIMIT): string | null {
  if (typeof markdown !== "string") return null;
  const plain = markdown
    .replace(/\r\n?/g, "\n")
    .replace(/<[^>\n]*>/g, "")
    .split(FENCE).join("")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^(\s*)[*+]\s+/gm, "$1- ")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?![\w*])/g, "$1$2")
    .replace(/`([^`\n]*)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!plain) return null;
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}
