import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { latestAddonRelease } from "@/lib/addon-release";
import { addonReleaseFor, fetchReleases, fileSize, newestDesktopRelease, RELEASES_PAGE, servedFile } from "@/lib/everloot-releases";
import { REPO_URL } from "@/lib/source";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Addon and Desktop App Downloads", description: "Download the Everloot addon for WoW: Forever and the optional Desktop App for Windows, macOS and Linux, with versions, file sizes and SHA-256 checksums.", path: "/addon" }),
};

// The Desktop App release is read from GitHub, so the page is rebuilt at most once an hour.
export const revalidate = 3600;

const link = "text-accent hover:underline underline-offset-4";
const EXT = "noopener noreferrer";

/** The Desktop App files the page offers, in this order, matched by the end of the artifact name. */
const DESKTOP_KINDS = [
  { suffix: "-win-x64-setup.exe", label: "Windows installer", needs: "Windows 10 or 11, 64-bit" },
  { suffix: "-win-x64-portable.exe", label: "Windows portable", needs: "Windows 10 or 11, 64-bit. Runs without installing" },
  { suffix: "-mac-arm64.dmg", label: "macOS disk image", needs: "Apple silicon (M1 or newer), macOS 13 Ventura or later. No Intel build yet" },
  { suffix: "-linux-x86_64.AppImage", label: "Linux AppImage", needs: "64-bit x86 Linux" },
];

function Checksum({ name, sha256 }: { name: string; sha256: string | null }) {
  return (
    <li>
      <span className="text-fg-2">{name}</span>
      <code className="block font-mono text-xs text-muted break-all">{sha256 ?? "not reported"}</code>
    </li>
  );
}

export default async function AddonPage() {
  const addon = latestAddonRelease();
  // The zip's name is rebuilt from the version (digits and dots) and encoded, so no name read from disk reaches an href.
  const zipName = addon ? `Everloot-${addon.version}.zip` : "";
  const zipHref = `/downloads/${encodeURIComponent(zipName)}`;
  const served = addon ? servedFile(zipHref) : null;
  const releases = await fetchReleases();
  const addonRelease = addon ? addonReleaseFor(releases, addon.version) : null;
  const desktop = newestDesktopRelease(releases);
  const desktopFiles = desktop
    ? DESKTOP_KINDS.flatMap((kind) => {
        const file = desktop.files.find((f) => f.name.endsWith(kind.suffix));
        return file ? [{ ...kind, file }] : [];
      })
    : [];

  return (
    <article className="space-y-8 max-w-5xl mx-auto">
      <header className="pt-6 space-y-3">
        <p className="font-mono text-xs text-muted">Downloads</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Everloot addon and Desktop App</h1>
        <p className="text-fg-2 max-w-3xl">
          The addon records what you see in WoW: Forever and saves it to a file on your computer. The Desktop App is
          optional: it sits in the tray, uploads that file after you log out, and keeps community market prices in your
          item tooltips. Both are free and open source under the AGPL-3.0.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-6 items-start">
        <section aria-labelledby="addon" className="rounded-xl border border-line p-5 space-y-4">
          <div className="space-y-1">
            <h2 id="addon" className="text-xl font-semibold text-fg">The addon</h2>
            {addon && (
              <p className="text-sm text-muted">
                Version {addon.version}, beta{addonRelease ? `, released ${addonRelease.date}` : ""}. For the WoW: Forever client.
              </p>
            )}
          </div>
          {addon ? (
            <>
              <a className="btn btn-primary text-sm" href={zipHref} download>
                Download addon {addon.version}{served ? ` (.zip, ${fileSize(served.size)})` : ""}
              </a>
              <div className="space-y-2">
                <h3 className="font-semibold text-fg">Install</h3>
                <ol className="list-decimal pl-5 space-y-1 text-sm text-fg-2">
                  <li>Quit the game.</li>
                  <li>Extract the zip. It holds one folder, <code className="font-mono">Everloot</code>.</li>
                  <li>
                    Move that folder into <code className="font-mono">Interface/AddOns</code>, inside the folder of the game
                    version you play under <code className="font-mono">World of Warcraft</code>.
                  </li>
                  <li>Start the game, check Everloot is ticked in the AddOns list, and type <code className="font-mono">/everloot status</code> in chat.</li>
                </ol>
                <p className="text-sm text-fg-2">
                  To send what it collected, log out and pick <code className="font-mono">Everloot.lua</code> on the{" "}
                  <Link href="/upload" className={link}>upload page</Link>, which shows you everything before it is sent. Or let the
                  Desktop App do it.
                </p>
              </div>
              {served && (
                <div className="space-y-1 text-sm">
                  <h3 className="font-semibold text-fg">SHA-256</h3>
                  <ul><Checksum name={zipName} sha256={served.sha256} /></ul>
                  {addonRelease?.sums && <a className={link} href={addonRelease.sums} rel={EXT}>SHA256SUMS</a>}
                </div>
              )}
              <p className="text-sm text-fg-2">
                <a className={link} href={addonRelease?.url ?? RELEASES_PAGE} rel={EXT}>Release notes</a>
                {" · "}
                <a className={link} href={`${REPO_URL}/tree/main/addon`} rel={EXT}>Source code</a>
              </p>
            </>
          ) : (
            <p className="text-fg-2">
              The addon download is not available on this site right now. It is on the{" "}
              <a className={link} href={RELEASES_PAGE} rel={EXT}>releases page</a>.
            </p>
          )}
        </section>

        <section aria-labelledby="desktop" className="rounded-xl border border-line p-5 space-y-4">
          <div className="space-y-1">
            <h2 id="desktop" className="text-xl font-semibold text-fg">Everloot Desktop App</h2>
            {desktop && <p className="text-sm text-muted">Version {desktop.version}, released {desktop.date}. Optional.</p>}
          </div>
          <p className="text-sm text-fg-2">
            After every logout or <code className="font-mono">/reload</code> it uploads the addon&apos;s anonymous observations,
            writes community prices for the realms you scanned into a small companion addon, and can answer <code className="font-mono">/ask</code>{" "}
            questions in game if you turn that on. It shows what leaves your computer and runs nothing until you press Start.
          </p>
          {desktopFiles.length > 0 ? (
            <ul className="space-y-3">
              {desktopFiles.map(({ label, needs, file }) => (
                <li key={file.name} className="space-y-1">
                  <a className="btn text-sm" href={file.url} rel={EXT}>
                    {label} ({fileSize(file.size)})
                  </a>
                  <p className="text-xs text-muted">{needs}.</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-2">
              The download list could not be loaded right now. The files are on the{" "}
              <a className={link} href={RELEASES_PAGE} rel={EXT}>releases page</a>, under the newest{" "}
              <code className="font-mono">desktop-v</code> release.
            </p>
          )}
          <div className="rounded-lg border border-line bg-panel/40 p-4 space-y-2 text-sm text-fg-2">
            <h3 className="font-semibold text-fg">The builds are not code-signed yet</h3>
            <p>Your system will warn you the first time you open the app. That is expected for now.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Windows: SmartScreen says &ldquo;Windows protected your PC&rdquo;. Choose More info, then Run anyway.</li>
              <li>
                macOS: it says Apple could not verify the app. Open System Settings, Privacy &amp; Security, and choose Open
                Anyway. On macOS 14 and earlier, right-click the app and choose Open instead.
              </li>
              <li>Linux: make the AppImage executable (<code className="font-mono">chmod +x</code>), then run it. Some distributions need FUSE 2 installed.</li>
            </ul>
            <p>
              If you want to be sure a file is the one we published, compare its SHA-256 with the list below before opening
              it: <code className="font-mono">certutil -hashfile FILE SHA256</code> on Windows,{" "}
              <code className="font-mono">shasum -a 256 FILE</code> on macOS, <code className="font-mono">sha256sum FILE</code> on Linux.
            </p>
            <p>The Windows build has been installed and run by us. The macOS and Linux builds pass the same automated build and tests but have not been opened by a person yet.</p>
          </div>
          {desktop && desktopFiles.length > 0 && (
            <div className="space-y-1 text-sm">
              <h3 className="font-semibold text-fg">SHA-256</h3>
              <ul className="space-y-1">
                {desktopFiles.map(({ file }) => <Checksum key={file.name} name={file.name} sha256={file.sha256} />)}
              </ul>
              {desktop.sums && <a className={link} href={desktop.sums} rel={EXT}>SHA256SUMS</a>}
            </div>
          )}
          <p className="text-sm text-fg-2">
            <a className={link} href={desktop?.url ?? RELEASES_PAGE} rel={EXT}>Release notes</a>
            {" · "}
            <a className={link} href={`${REPO_URL}/tree/main/desktop`} rel={EXT}>Source code</a>
          </p>
        </section>
      </div>

      <section aria-labelledby="privacy" className="space-y-2 max-w-3xl">
        <h2 id="privacy" className="text-xl font-semibold text-fg">Privacy</h2>
        <p className="text-sm text-fg-2">
          The addon only writes a file on your computer. Uploads, from the upload page or the app, carry anonymous
          observations; named data stays on your computer unless you choose to share it. Read the{" "}
          <Link href="/privacy" className={link}>Privacy Policy</Link> and the{" "}
          <a className={link} href={`${REPO_URL}/blob/main/docs/DATA_POLICY.md`} rel={EXT}>data policy</a>.
        </p>
        <p className="text-sm text-fg-2">
          Every release, including nightly addon builds marked as pre-releases, is on{" "}
          <a className={link} href={RELEASES_PAGE} rel={EXT}>GitHub</a>.
        </p>
      </section>
    </article>
  );
}
