"use client";

import { useEffect, useState, type ReactNode } from "react";
import { articleMarkdown } from "@/lib/docs/markdown";

/** Copies the page as Markdown, for pasting into an assistant or an issue. Says when it worked. */
export function CopyPage() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    const article = document.querySelector("[data-docs-article]");
    if (!article) return;
    try {
      await navigator.clipboard.writeText(articleMarkdown(article, window.location.origin));
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2000);
  };
  return (
    <button type="button" onClick={copy} data-md-skip className="btn min-h-9 px-3 text-sm" aria-live="polite">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"><path d="M8 8h11v12H8zM5 16V4h11" /></svg>
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy page"}
    </button>
  );
}

interface Heading { id: string; text: string; level: 2 | 3 }

/**
 * "On this page": the article's h2 and h3, read after render, with the section in view marked. Nothing
 * is drawn for a page with fewer than two headings.
 */
export function OnThisPage() {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const found = [...document.querySelectorAll<HTMLElement>("[data-docs-article] h2[id], [data-docs-article] h3[id]")];
    // The heading's own words, without its "#" link.
    const words = (h: HTMLElement) => [...h.childNodes].filter((n) => !(n instanceof HTMLElement && n.hasAttribute("data-md-skip"))).map((n) => n.textContent).join("").trim();
    setHeadings(found.map((h) => ({ id: h.id, text: words(h), level: h.tagName === "H2" ? 2 : 3 })));
    if (!found.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setCurrent(visible[0].target.id);
    }, { rootMargin: "-96px 0px -70% 0px" });
    found.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, []);

  if (headings.length < 2) return null;
  return (
    <nav aria-label="On this page" data-md-skip className="text-sm">
      <p className="mb-3 flex items-center gap-2 font-semibold text-fg">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M4 6h16M4 12h10M4 18h13" /></svg>
        On this page
      </p>
      <ul className="space-y-2 border-l border-line">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              aria-current={current === h.id ? "location" : undefined}
              className={`-ml-px block border-l py-0.5 transition-colors ${h.level === 3 ? "pl-6" : "pl-3"} ${current === h.id ? "border-accent text-accent" : "border-transparent text-fg-2 hover:text-fg"}`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export interface CodeTab {
  label: string;
  lang: string;
  code: string;
}

/** Tokens for a light, dependency-free highlight: strings, numbers, comments and a few keywords. */
const TOKEN = /(\/\/[^\n]*|#(?![!{])[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|\b(?:const|let|await|async|function|return|import|from|for|of|in|if|else|def|with|as|print|true|false|null|None|True|False|curl|new)\b)/g;

function highlight(code: string, lang: string) {
  if (lang === "text") return code;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of code.matchAll(TOKEN)) {
    const t = match[0];
    const at = match.index ?? 0;
    // A shell comment needs a space before it; a # inside a URL is not one.
    if (t.startsWith("#") && (lang !== "bash" && lang !== "python" || (at > 0 && !/\s/.test(code[at - 1]!)))) continue;
    if (t.startsWith("//") && lang !== "js" && lang !== "ts") continue;
    parts.push(code.slice(last, at));
    const cls = t.startsWith("//") || t.startsWith("#") ? "text-muted" : /^["'`]/.test(t) ? "text-accent" : /^\d/.test(t) ? "text-warning" : "text-q-rare";
    parts.push(<span key={at} className={cls}>{t}</span>);
    last = at + t.length;
  }
  parts.push(code.slice(last));
  return parts;
}

/**
 * Code in tabs (curl, JavaScript, Python …), each with a copy button. Every tab is in the HTML, so
 * it reads without JavaScript and "Copy page" takes all of them.
 */
export function CodeGroup({ tabs, title, className = "" }: { tabs: CodeTab[]; title?: string; className?: string }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tabs[active]!.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* the clipboard is unavailable; the code is still selectable */ }
  };
  return (
    <div className={`overflow-hidden rounded-card border border-line bg-tooltip ${className}`.trim()}>
      <div data-md-skip className="flex items-center gap-1 border-b border-line px-2">
        {title && <span className="mr-2 px-2 py-2 text-xs font-medium text-fg">{title}</span>}
        <div role="tablist" aria-label={title ?? "Code examples"} className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {tabs.length > 1 ? tabs.map((tab, i) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`-mb-px min-h-9 shrink-0 border-b-2 px-2 text-xs font-medium ${i === active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
            >
              {tab.label}
            </button>
          )) : !title && <span className="px-2 py-2 text-xs font-medium text-muted">{tabs[0]?.label}</span>}
        </div>
        <button type="button" onClick={copy} aria-label={`Copy ${tabs[active]?.label ?? "code"}`} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 px-2 text-xs text-muted hover:text-fg">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"><path d="M8 8h11v12H8zM5 16V4h11" /></svg>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {tabs.map((tab, i) => (
        <pre
          key={tab.label}
          data-lang={tab.lang}
          data-label={tabs.length > 1 ? tab.label : undefined}
          hidden={i !== active}
          tabIndex={0}
          aria-label={tab.label}
          className="max-h-[32rem] overflow-auto whitespace-pre-wrap p-4 font-mono text-[13px] leading-relaxed text-fg [overflow-wrap:anywhere]"
        >
          {highlight(tab.code, tab.lang)}
        </pre>
      ))}
    </div>
  );
}
