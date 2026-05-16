import Link from "next/link";
import { Tool } from "@/data/tools";
import EmailCapture from "./EmailCapture";

export default function ComingSoon({
  tool,
  previewSections,
}: {
  tool: Tool;
  previewSections: { title: string; body: string }[];
}) {
  return (
    <article className="space-y-10">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">
          Coming soon · {tool.shortTitle}
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100">
          {tool.title}
        </h1>
        <p className="text-lg text-parchment-100/75 max-w-2xl">{tool.description}</p>
      </header>

      <div className="rounded-2xl border border-gold-500/30 bg-gradient-to-br from-gold-500/5 to-transparent p-6 max-w-xl">
        <EmailCapture toolSlug={tool.slug} />
      </div>

      <section className="space-y-6">
        <h2 className="font-display text-2xl text-parchment-100">
          What it will do
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {previewSections.map((s) => (
            <div
              key={s.title}
              className="rounded-xl border border-parchment-100/10 p-5 bg-parchment-900/40"
            >
              <h3 className="font-display text-lg font-semibold text-gold-400">
                {s.title}
              </h3>
              <p className="mt-1 text-sm text-parchment-100/80">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pt-4 border-t border-parchment-100/10">
        <p className="text-sm text-parchment-100/70">
          In the meantime, try the{" "}
          <Link
            href="/tools/gold-per-hour"
            className="text-gold-400 hover:text-gold-300 underline-offset-4 hover:underline"
          >
            Gold per Hour Calculator
          </Link>{" "}
          — our first live tool.
        </p>
      </section>
    </article>
  );
}
