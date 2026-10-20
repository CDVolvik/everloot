/**
 * A command, a config file or a response shape, as the reader should copy it. In the card frame,
 * mono, never wrapped: a long line scrolls inside the frame, never the page. Focusable so a keyboard
 * can scroll it; `label` names it for screen readers. `title` is the small bar above the code
 * ("Claude Code", "mcp.json").
 */
export default function CodeBlock({ children, label, title }: { children: string; label: string; title?: string }) {
  return (
    <div data-code-block className="min-w-0 max-w-full overflow-hidden rounded-card border border-line bg-panel">
      {title && <p className="border-b border-line px-4 py-2 font-mono text-xs text-muted">{title}</p>}
      <pre aria-label={label} tabIndex={0} className="max-w-full overflow-x-auto whitespace-pre p-4 font-mono text-sm leading-relaxed text-fg [overflow-wrap:normal]">{children}</pre>
    </div>
  );
}
