import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { curatedAddon } from "@/data/addon-repos";
import { addonGithub, type AddonGithubResult } from "@/lib/addon-github";
import { dataAgeLabel } from "@/lib/data-age";
import { loadPopularAddons } from "@/lib/rollup-compute";
import { REPO_URL } from "@/lib/source";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

/** Every link that leaves Everloot. */
const EXT = "noopener noreferrer nofollow";
const link = "text-accent hover:underline underline-offset-4";
const button = "btn min-h-11";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const percent = (share: number) => `${Number((share * 100).toFixed(1))}%`;
const day = (iso: string) => new Date(iso).toISOString().slice(0, 10);

type Props = { params: Promise<{ name: string }> };

type Found = {
  /** The name as the site spells it, or as typed when storage is down and nothing can be checked. */
  name: string;
  stats: Awaited<ReturnType<typeof loadPopularAddons>>["addons"][number] | null;
  source: NonNullable<ReturnType<typeof curatedAddon>>["source"] | null;
  usage: Awaited<ReturnType<typeof loadPopularAddons>>;
} | null;

/**
 * A page exists for an addon three installs report, or one on the curated list. Anything else is
 * not found, so a made-up name and a one- or two-install addon answer alike. When storage is down
 * nothing can be ruled out, so the page renders its outage sentence instead of a 404.
 * Names match without regard to case; `null` also covers a name that is not valid percent-encoding.
 */
async function find(params: Props["params"]): Promise<Found> {
  let typed: string;
  try {
    typed = decodeURIComponent((await params).name);
  } catch {
    return null;
  }
  const usage = await loadPopularAddons();
  const lower = typed.toLowerCase();
  const stats = usage.unreachable ? null : usage.addons.find((a) => a.name === typed) ?? usage.addons.find((a) => a.name.toLowerCase() === lower) ?? null;
  const curated = curatedAddon(typed);
  if (!stats && !curated && !usage.unreachable) return null;
  return { name: stats?.name ?? curated?.name ?? typed, stats, source: curated?.source ?? null, usage };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await find(params);
  if (!found) return { title: "Addon not found" };
  const title = found.stats?.title ?? found.name;
  return pageMetadata({
    title: `${title}: addon for WoW: Forever`,
    description: `How many Everloot installs run ${title}, where its author publishes it and what its repository shows. Counts appear once three installs report the addon.`,
    path: `/addons/${encodeURIComponent(found.name)}`,
  });
}

function OptIn() {
  return (
    <p className="text-sm text-fg-2">
      To add yours, type <code className="font-mono text-fg">/everloot addons on</code> in the game, play, log out, then
      send your save file from the <Link href="/upload" className={link}>upload page</Link>. The preview names every
      addon before anything is sent.
    </p>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4 space-y-1">
      <dt className="text-xs font-mono text-muted">{label}</dt>
      <dd className="font-mono text-lg tabular-nums text-fg">{children}</dd>
    </div>
  );
}

function GithubFacts({ result, repo }: { result: AddonGithubResult; repo: string }) {
  const repoUrl = `https://github.com/${repo}`;
  if (result.status === "missing") {
    return (
      <p className="text-sm text-muted">
        The repository Everloot has on file, <span className="font-mono">{repo}</span>, was not found on GitHub. It may
        have moved or been made private. Check the author&apos;s download page for the newest version.
      </p>
    );
  }
  if (result.status === "unavailable") {
    return (
      <p className="text-sm text-muted">
        {result.rateLimited
          ? "GitHub is limiting how often Everloot can ask it, so the repository facts are missing for now. They return within the hour."
          : "GitHub did not answer, so the repository facts are missing for now."}{" "}
        The <a className={link} href={`${repoUrl}/releases`} rel={EXT}>releases page</a> has the newest version.
      </p>
    );
  }
  const g = result.data;
  return (
    <div className="space-y-4">
      <dl className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat label="Licence">{g.license ?? "Not stated"}</Stat>
        <Stat label="Last commit">{g.lastCommit ?? "Unknown"}</Stat>
        <Stat label="Open issues">{g.openIssues ?? "Unknown"}</Stat>
        <Stat label="Contributors">{g.contributors ? `${g.contributors.count}${g.contributors.capped ? "+" : ""}` : "Unknown"}</Stat>
      </dl>
      {g.archived && <p className="text-sm text-fg-2">The author has archived this repository, so it no longer takes changes.</p>}
      {g.release ? (
        <div className="space-y-2">
          <p className="text-sm text-fg-2">
            Latest release{" "}
            <a className={link} href={g.release.url} rel={EXT}>{g.release.name ?? g.release.tag}</a>
            {g.release.name && g.release.name !== g.release.tag ? ` (${g.release.tag})` : ""}, published {g.release.date}.
          </p>
          {g.release.notes && (
            <figure className="rounded-xl border border-line bg-panel p-4 space-y-2">
              <figcaption className="text-xs font-mono text-muted">Release notes, in the author&apos;s words</figcaption>
              <p className="text-sm text-fg-2 whitespace-pre-wrap break-words">{g.release.notes}</p>
            </figure>
          )}
        </div>
      ) : (
        <p className="text-sm text-fg-2">This repository has no published release yet.</p>
      )}
      {g.tree.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm text-fg">Top level of the repository</h3>
          <ul className="flex flex-wrap gap-2 font-mono text-xs">
            {g.tree.map((entry) => (
              <li key={entry.name} className="rounded-md border border-line bg-panel px-2 py-1 text-fg-2">
                {entry.name}{entry.kind === "dir" ? "/" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted">
        From GitHub&apos;s public API, refreshed hourly. <a className={link} href={g.url} rel={EXT}>View on GitHub</a>
      </p>
    </div>
  );
}

export default async function AddonProfilePage({ params }: Props) {
  const found = await find(params);
  if (!found) notFound();
  const { name, stats, source, usage } = found;
  const { reportingInstalls, unreachable, dataAsOf } = usage;
  if (name !== decodeURIComponent((await params).name)) redirect(`/addons/${encodeURIComponent(name)}`);
  const github = source ? await addonGithub(source.repo) : null;
  const title = stats?.title ?? name;
  const repoUrl = source ? `https://github.com/${source.repo}` : null;

  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          <Link href="/addons/popular" className={link}>Popular addons</Link> · {unreachable ? "Storage unreachable" : dataAgeLabel(dataAsOf)}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">{title}</h1>
        <p className="text-fg-2 max-w-2xl">
          An addon for WoW: Forever, made by its own author. Everloot has not tested it, and neither Everloot nor the
          author of another addon vouches for it.
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="usage">
        <h2 id="usage" className="text-xl text-fg">Who runs it</h2>
        {unreachable ? (
          <p className="text-fg-2">{STORAGE_UNREACHABLE}</p>
        ) : stats ? (
          <>
            <dl className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <Stat label="Installs reporting">{stats.installs}</Stat>
              <Stat label="Share">
                {percent(stats.share)}
                <span className="block text-xs text-muted">{stats.loadedInstalls} of {reportingInstalls} loaded it</span>
              </Stat>
              <Stat label="First seen">{day(stats.firstSeen)}</Stat>
              <Stat label="Last seen">{day(stats.lastSeen)}</Stat>
            </dl>
            <p className="text-sm text-fg-2">
              {stats.versions.length > 0 ? (
                <>
                  Versions at least three installs report:{" "}
                  {stats.versions.map((v, i) => (
                    <span key={v.version}>
                      {i > 0 && ", "}
                      <span className="font-mono text-fg">{v.version}</span> ({plural(v.installs, "install", "installs")})
                    </span>
                  ))}
                  .
                </>
              ) : (
                "No single version is reported by three installs yet."
              )}
            </p>
            <p className="text-sm text-muted">
              Counted from Everloot uploads by players who turned the addon list on. An install is one copy of the
              Everloot addon, not proof of one person. Share is out of every install that reported its addons.
            </p>
          </>
        ) : (
          <div className="rounded-xl border border-line bg-panel p-6 space-y-2">
            <p className="text-fg">
              Everloot shows numbers for an addon once three installs report it. This one has not reached three yet.
            </p>
            <OptIn />
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="repo">
        <h2 id="repo" className="text-xl text-fg">The repository</h2>
        {source && github ? (
          <GithubFacts result={github} repo={source.repo} />
        ) : (
          <p className="text-sm text-fg-2">
            Everloot does not know where this addon&apos;s code is published, so there are no repository facts. If you
            know, <Link href="/contact" className={link}>tell us</Link> or open an issue on{" "}
            <a className={link} href={`${REPO_URL}/issues`} rel={EXT}>GitHub</a>.
          </p>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="download">
        <h2 id="download" className="text-xl text-fg">Download from the author</h2>
        {source ? (
          <>
            <div className="flex flex-wrap gap-3">
              {repoUrl && <a className={button} href={`${repoUrl}/releases`} rel={EXT}>GitHub releases</a>}
              {source.curseforge && <a className={button} href={source.curseforge} rel={EXT}>CurseForge</a>}
              {source.wago && <a className={button} href={source.wago} rel={EXT}>Wago</a>}
              {source.wowinterface && <a className={button} href={source.wowinterface} rel={EXT}>WoWInterface</a>}
            </div>
            <p className="text-sm text-muted">These links leave Everloot. Everloot hosts no addon files.</p>
          </>
        ) : (
          <p className="text-sm text-fg-2">
            Everloot does not know where the author publishes this one.{" "}
            <a className={link} rel={EXT} href={`https://www.curseforge.com/wow/search?search=${encodeURIComponent(title)}`}>
              Search CurseForge for {title}
            </a>{" "}
            opens a search there; Everloot does not use CurseForge&apos;s data and hosts no addon files.
          </p>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="use-data">
        <h2 id="use-data" className="text-xl text-fg">Use Everloot data in your addon</h2>
        <p className="text-fg-2 max-w-2xl">
          Everloot publishes what players see in the game under CC BY-SA 4.0: credit Everloot and share what you build
          from it under the same licence. Your addon&apos;s own code can keep its licence.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-fg-2">
          <li><Link href="/connect" className={link}>Connect</Link>: how to use the data from your own project.</li>
          <li><a href="/api/corpus/public" className={link}>The public API</a>: the published records as JSON.</li>
          <li>The MCP server, <code className="font-mono text-fg">/mcp/public</code>: the same data for AI tools. It speaks MCP, not a web page, so <Link href="/connect" className={link}>Connect</Link> explains how to point a tool at it.</li>
        </ul>
      </section>

      <footer className="border-t border-line pt-4 text-sm text-muted">
        <p>
          Addon lists are never published row by row, only these counts. How Everloot collects and publishes data is in
          the <a href={`${REPO_URL}/blob/main/docs/DATA_POLICY.md`} rel={EXT} className={link}>data policy</a>.
        </p>
      </footer>
    </article>
  );
}
