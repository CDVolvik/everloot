/**
 * The small Markdown a blue-post write-up may use (kb/src/blue-writeups.ts): paragraphs, "- " lists and
 * [links](…) to a site path or an https address. Anything else is shown as the text it is.
 */

export type Inline = string | { text: string; href: string };
export type Block = { kind: "p"; parts: Inline[] } | { kind: "ul"; items: Inline[][] };

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const safeHref = (href: string) => (/^\/(?!\/)/.test(href) || /^https:\/\/[^\s]+$/.test(href) ? href : null);

export function inlineParts(text: string): Inline[] {
  const parts: Inline[] = [];
  let at = 0;
  for (const m of text.matchAll(LINK)) {
    const href = safeHref(m[2]);
    if (m.index! > at) parts.push(text.slice(at, m.index));
    parts.push(href ? { text: m[1], href } : m[1]);
    at = m.index! + m[0].length;
  }
  if (at < text.length) parts.push(text.slice(at));
  // Neighbouring strings (a dropped link's text) read as one run, so a spell name across them still matches.
  return parts.reduce<Inline[]>((out, p) => {
    const last = out[out.length - 1];
    if (typeof p === "string" && typeof last === "string") out[out.length - 1] = last + p;
    else out.push(p);
    return out;
  }, []);
}

export function writeupBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.split(/\r?\n\s*\r?\n/)) {
    let para: string[] = [];
    let list: string[] = [];
    const flush = () => {
      if (para.length) blocks.push({ kind: "p", parts: inlineParts(para.join(" ")) });
      if (list.length) blocks.push({ kind: "ul", items: list.map(inlineParts) });
      para = [];
      list = [];
    };
    for (const raw of chunk.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const item = /^[-*]\s+(.*)$/.exec(line);
      if (item) {
        if (para.length) flush();
        list.push(item[1]);
      } else {
        if (list.length) flush();
        para.push(line);
      }
    }
    flush();
  }
  return blocks;
}

/** The write-up as plain text: link marks reduced to their words. */
export function writeupText(body: string): string {
  return writeupBlocks(body)
    .flatMap((b) => (b.kind === "p" ? [b.parts] : b.items))
    .map((parts) => parts.map((p) => (typeof p === "string" ? p : p.text)).join(""))
    .join(" ");
}
