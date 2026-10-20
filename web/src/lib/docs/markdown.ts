/**
 * A docs page as Markdown, for "Copy page": read from the rendered article, so the copy always matches
 * what the reader sees. Elements marked `data-md-skip` (the copy button, "On this page", previous and
 * next), the breadcrumb and scripts are left out; every tab of a code group is included, each under its label.
 */

function inline(node: Node, base: string): string {
  if (node.nodeType === 3) return (node.textContent ?? "").replace(/\s+/g, " ");
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  if (skipped(el) || el.getAttribute("aria-hidden") === "true") return "";
  const inner = () => [...el.childNodes].map((child) => inline(child, base)).join("");
  switch (el.tagName) {
    case "CODE": return `\`${el.textContent ?? ""}\``;
    case "STRONG": case "B": return `**${inner().trim()}**`;
    case "EM": case "I": return `*${inner().trim()}*`;
    case "BR": return "\n";
    case "A": {
      const href = el.getAttribute("href") ?? "";
      const text = inner().trim();
      return href && !href.startsWith("#") ? `[${text}](${new URL(href, base).href})` : text;
    }
    default: return inner();
  }
}

const skipped = (el: Element) => el.hasAttribute("data-md-skip") || el.hasAttribute("data-page-crumbs") || el.tagName === "SCRIPT";

function block(el: Element, base: string, depth = 0): string[] {
  if (skipped(el)) return [];
  const text = () => inline(el, base).replace(/[ \t]+/g, " ").trim();
  const children = () => [...el.children].flatMap((child) => block(child, base, depth));
  switch (el.tagName) {
    case "H1": return [`# ${text()}`];
    case "H2": return [`## ${text()}`];
    case "H3": return [`### ${text()}`];
    case "H4": return [`#### ${text()}`];
    case "P": return text() ? [text()] : [];
    case "PRE": {
      const lang = el.getAttribute("data-lang") ?? "";
      const label = el.getAttribute("data-label");
      const fence = `\`\`\`${lang}\n${(el.textContent ?? "").replace(/\n$/, "")}\n\`\`\``;
      return label ? [`${label}:`, fence] : [fence];
    }
    case "UL": case "OL": {
      const ordered = el.tagName === "OL";
      return [[...el.children].filter((li) => li.tagName === "LI").map((li, i) => {
        const nested = [...li.children].filter((c) => c.tagName === "UL" || c.tagName === "OL");
        const own = [...li.childNodes].filter((c) => !(c.nodeType === 1 && nested.includes(c as Element)));
        const line = own.map((c) => (c.nodeType === 1 && ["P", "DIV"].includes((c as Element).tagName) ? inline(c, base) : inline(c, base))).join("").replace(/\s+/g, " ").trim();
        const sub = nested.flatMap((n) => block(n, base, depth + 1));
        return [`${"  ".repeat(depth)}${ordered ? `${i + 1}.` : "-"} ${line}`, ...sub].join("\n");
      }).join("\n")];
    }
    case "TABLE": {
      const rows = [...el.querySelectorAll("tr")].map((tr) => [...tr.children].map((cell) => inline(cell, base).replace(/\s+/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").trim()));
      if (!rows.length) return [];
      const [head, ...body] = rows;
      return [[`| ${head!.join(" | ")} |`, `| ${head!.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n")];
    }
    case "ASIDE": return children().map((part) => part.split("\n").map((line) => `> ${line}`).join("\n"));
    case "HR": return ["---"];
    default: return children();
  }
}

export function articleMarkdown(article: Element, base: string): string {
  return `${[...article.children].flatMap((child) => block(child, base)).join("\n\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
