import type { Metadata } from "next";
import Link from "next/link";
import { curatedAddon } from "@/data/addon-repos";
import { BADGES, buildBoards, loadEcosystem, type BadgeId, type ProjectView } from "@/lib/ecosystem";
import { pageMetadata } from "@/lib/seo";
import { REPO_URL } from "@/lib/source";

export const metadata: Metadata = pageMetadata({
  title: "WoW Forever Addons and Open-Source Projects",
  description: "A community tracker of WoW: Forever addons and tools: five boards, a Forever-ready check against each .toc, GitHub repo facts and Everloot install counts.",
  path: "/addons/ecosystem",
});
export const dynamic = "force-dynamic";

const EXT = "noopener noreferrer nofollow";
const link = "text-accent hover:underline underline-offset-4";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const day = (iso: string) => iso.slice(0, 10);
const refreshed = (iso: string | null) =>
  iso ? `GitHub facts refreshed ${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : "GitHub facts not refreshed yet";

const BADGE_LABEL: Record<BadgeId, string> = {
  "forever-ready": "Forever-ready",
  active: "Active",
  "fresh-release": "Fresh release",
  responsive: "Responsive",
  "open-license": "Licensed",
  archived: "Archived",
};

function Badge({ id }: { id: BadgeId }) {
  return (
    <li title={BADGES[id]} className="rounded-full border border-line px-2.5 py-0.5 text-xs font-mono text-fg-2">
      {BADGE_LABEL[id]}
      <span className="sr-only">: {BADGES[id]}</span>
    </li>
  );
}

function profileHref(project: ProjectView): string | null {
  const name = project.addonNames[0];
  if (!name) return null;
  return project.installs !== null || curatedAddon(name) ? `/addons/${encodeURIComponent(name)}` : null;
}

function Card({ project }: { project: ProjectView }) {
  const m = project.metrics?.status === "ok" ? project.metrics : null;
  const profile = profileHref(project);
  const ready =
    project.foreverReady === "yes" ? "Forever-ready" : project.foreverReady === "no" ? "Not declared for Forever" : "Forever-ready not checked";
  return (
    <li className="rounded-xl border border-line bg-panel/40 p-5 space-y-3">
      <div className="space-y-1">
        <p className="font-mono text-xs text-muted">{project.kind === "addon" ? "Addon" : "Tool"} · {ready}</p>
        <h3 className="text-xl font-semibold text-fg">{project.name}</h3>
        <p className="text-sm text-fg-2">{project.summary}</p>
      </div>
      {project.badges.length > 0 && <ul className="flex flex-wrap gap-2" aria-label="Badges">{project.badges.map((b) => <Badge key={b} id={b} />)}</ul>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div><dt className="text-xs font-mono text-muted">Everloot installs</dt><dd className="font-mono tabular-nums">{project.installs !== null ? project.installs : "not counted"}</dd></div>
        <div><dt className="text-xs font-mono text-muted">Stars</dt><dd className="font-mono tabular-nums">{m?.stars ?? "unknown"}</dd></div>
        <div><dt className="text-xs font-mono text-muted">Latest release</dt><dd className="font-mono">{m?.release ? <a href={m.release.url} rel={EXT} className={link}>{m.release.tag}</a> : "none on GitHub"}{m?.release && <span className="block text-xs text-muted">{day(m.release.date)}</span>}</dd></div>
        <div><dt className="text-xs font-mono text-muted">Last commit</dt><dd className="font-mono tabular-nums">{m?.lastCommit ? day(m.lastCommit) : "unknown"}</dd></div>
        <div><dt className="text-xs font-mono text-muted">Commits, 4 weeks</dt><dd className="font-mono tabular-nums">{m?.commits4w ?? "unknown"}</dd></div>
        <div><dt className="text-xs font-mono text-muted">Contributors</dt><dd className="font-mono tabular-nums">{m?.contributors ?? "unknown"}</dd></div>
        <div><dt className="text-xs font-mono text-muted">Issues, open / closed</dt><dd className="font-mono tabular-nums">{m?.openIssues != null && m.closedIssues != null ? `${m.openIssues} / ${m.closedIssues}` : "unknown"}</dd></div>
        <div><dt className="text-xs font-mono text-muted">Median first reply</dt><dd className="font-mono tabular-nums">{m?.medianFirstResponseHours != null ? `${m.medianFirstResponseHours} h` : "not measured"}</dd></div>
      </dl>
      {project.metrics?.status === "missing" && <p className="text-sm text-fg-2">Its repository was not found. It may be private or renamed.</p>}
      <p className="flex flex-wrap gap-x-4">
        <a href={project.url} rel={EXT} className={`inline-flex items-center min-h-11 ${link}`}>GitHub<span className="sr-only"> repository of {project.name}</span></a>
        {profile && <Link href={profile} className={`inline-flex items-center min-h-11 ${link}`}>Everloot page<span className="sr-only"> for {project.name}</span></Link>}
      </p>
    </li>
  );
}

export default async function EcosystemPage() {
  const view = await loadEcosystem();
  const boards = buildBoards(view, new Date());
  const issueUrl = `${REPO_URL}/issues/new?template=ecosystem-project.yml`;
  return (
    <article className="space-y-10 max-w-5xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          {plural(view.projects.length, "project", "projects")} · {refreshed(view.refreshedAt)}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Forever addons and projects</h1>
        <p className="text-fg-2 max-w-2xl">
          A community list of addons and tools made for WoW: Forever, each checked by a maintainer. The boards rank
          projects, not people. Repository facts come from GitHub&apos;s public API; installs are counted from Everloot
          uploads, and shown once three installs report the addon.
        </p>
        <p className="text-sm text-fg-2 max-w-2xl">
          {view.forever ? (
            <>
              Forever-ready means the addon&apos;s .toc lists Interface {view.forever.interface}, the number for Forever build{" "}
              {view.forever.version}. Blizzard&apos;s game files do not state it; we derive it from the version, the way
              Classic Era 1.15.9 is 11509. It is not confirmed in the live client yet, so treat the badge as a hint, not a promise it loads.
            </>
          ) : (
            "Forever-ready is not checked: no Forever build is known."
          )}
        </p>
      </header>

      <section aria-labelledby="boards" className="space-y-4">
        <h2 id="boards" className="text-xl font-semibold text-fg">Boards</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {boards.map((board) => (
            <section key={board.id} aria-labelledby={`board-${board.id}`} className="rounded-xl border border-line bg-panel p-5 space-y-3">
              <div className="space-y-1">
                <h3 id={`board-${board.id}`} className="text-lg font-semibold text-fg">{board.title}</h3>
                <p className="text-xs text-muted">{board.rule}</p>
              </div>
              {board.rows.length === 0 ? (
                <p className="text-sm text-fg-2">
                  {board.id === "installed" && !view.installsAvailable ? "Install counts are unavailable right now." : "No project qualifies yet."}
                </p>
              ) : (
                <ol className="space-y-2">
                  {board.rows.map((row, i) => (
                    <li key={row.project.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span><span className="font-mono tabular-nums text-fg-2 mr-2">{i + 1}</span><span className="text-fg">{row.project.name}</span></span>
                      <span className="font-mono text-xs text-muted tabular-nums text-right">{row.display}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      </section>

      <section aria-labelledby="projects" className="space-y-4">
        <h2 id="projects" className="text-xl font-semibold text-fg">Projects</h2>
        <ul className="grid md:grid-cols-2 gap-4">
          {[...view.projects].sort((a, b) => a.name.localeCompare(b.name)).map((p) => <Card key={p.id} project={p} />)}
        </ul>
      </section>

      <section aria-labelledby="add" className="space-y-2">
        <h2 id="add" className="text-xl font-semibold text-fg">Add a project, or ask to be removed</h2>
        <p className="text-sm text-fg-2 max-w-2xl">
          Open an issue with the repository link and where it says the project is for Forever. A maintainer checks it
          and adds it by hand. Authors can also ask to be taken off.
        </p>
        <a href={issueUrl} rel={EXT} className={`inline-flex items-center min-h-11 ${link}`}>Suggest a project</a>
      </section>

      <footer className="border-t border-line pt-4 text-sm text-muted space-y-1">
        <p>
          Repository facts are read from <a href="https://docs.github.com/en/rest" rel={EXT} className={link}>GitHub&apos;s public API</a> at
          most every few hours and shown with a link to each repository. Stars can be bought, so only the Rising board uses
          them, and only as a week&apos;s gain. CurseForge, Wago and WoWInterface are linked, never read.
        </p>
        <p>
          How Everloot collects and publishes data is in the <a href={`${REPO_URL}/blob/main/docs/DATA_POLICY.md`} rel="noopener" className={link}>data policy</a>.
          Everloot is not affiliated with these projects.
        </p>
      </footer>
    </article>
  );
}
