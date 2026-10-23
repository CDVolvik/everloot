import type { Metadata } from "next";
import Link from "next/link";
import { Callout, C, H2, List, P, Table, docLink } from "@/components/docs/blocks";
import DocPage from "@/components/docs/DocPage";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "The Everloot Desktop App",
  description: "The optional Everloot Desktop App uploads your addon data after each logout and brings community prices back for your in-game item tooltips.",
  path: "/docs/guides/desktop",
});

export default function Page() {
  return (
    <DocPage href="/docs/guides/desktop">
      <P>
        The Desktop App sits in your system tray beside the game. After you log out or type <C>/reload</C>, it uploads
        what the addon recorded, and it writes community market prices into a small price addon, EverlootPrices, so they
        show in your item tooltips. It is free and open source under the AGPL-3.0.
      </P>
      <Callout kind="note">
        <p>
          The app is optional. The addon works without it, and you can always upload your file by hand on the{" "}
          <Link href="/upload" className={docLink}>upload page</Link>.
        </p>
      </Callout>

      <H2 id="what-it-does">What it does</H2>
      <Table
        head={["Job", "What happens", "When"]}
        rows={[
          ["Upload", "Sends the anonymous events the site has not confirmed yet, and census rows if you allowed them, from the Everloot.lua file of each account.", "After the game writes the file, at logout or /reload."],
          ["Market prices", "Writes community prices for the realms you scanned, and the realms you follow, into the EverlootPrices price addon.", "After each upload, and every hour."],
          ["/ask", "Answers questions you typed with /ask in game, if you turn it on.", "After the game writes the file."],
        ]}
      />
      <P>
        The app also has a Chat page, where you can ask about the game or about your own characters, and a Characters
        page that reads your gold, gear and progress from your save file. That stays on your computer and is never
        uploaded from there.
      </P>
      <P>
        It follows the same rules as the website. The app sends anonymous open-world events, and census rows if you
        allowed the census on its setup screen (the box is ticked until you untick it; a switch in its settings changes
        it later). It never sends named data (guild, gear, gold, collection) or your installed addon list; those stay on your
        computer. Player rows stay there too, unless you turn on <em>Send the player pages with the uploads</em> in its
        settings. Nothing touches the game client.
      </P>

      <H2 id="platforms">Platforms</H2>
      <Table
        head={["System", "File", "Needs"]}
        rows={[
          ["Windows", "Installer, or a portable exe that runs without installing", "Windows 10 or 11, 64-bit"],
          ["macOS", "Disk image", "Apple silicon (M1 or newer), macOS 13 Ventura or later. No Intel build yet."],
          ["Linux", "AppImage", "64-bit x86 Linux"],
        ]}
      />

      <H2 id="install">Install it</H2>
      <List ordered>
        <li>Download the file for your system from the <Link href="/addon" className={docLink}>downloads page</Link>, which lists versions and SHA-256 checksums.</li>
        <li>Open it. The builds are not code-signed yet, so your system warns you the first time. That is expected for now.</li>
        <li>On first run the app shows what leaves your computer and looks for your World of Warcraft folder. If it cannot find it, browse to the product folder that holds <C>WTF</C>.</li>
        <li>Press <strong>Start</strong>. The app runs nothing until you do.</li>
      </List>
      <Callout kind="warning">
        <p>
          Windows shows &quot;Windows protected your PC&quot;: choose More info, then Run anyway. On macOS, open System
          Settings, Privacy &amp; Security and choose Open Anyway (on macOS 14 and earlier, right-click the app and choose
          Open). On Linux, make the AppImage executable with <C>chmod +x</C>, then run it; some distributions need FUSE 2
          installed. To check a download, compare its SHA-256 with the one on the downloads page.
        </p>
      </Callout>

      <H2 id="optional">Where it is optional</H2>
      <P>
        You do not need the app to use the addon, to upload, or to read anything on the site. It saves two chores:
        choosing your file after each play session, and keeping community prices fresh in your tooltips.
      </P>
      <P>
        Closing the window keeps the app in the tray. On Windows installs, the app downloads updates itself and
        installs them when you restart it.
      </P>

      <H2 id="next">Next</H2>
      <List>
        <li><Link href="/docs/guides/upload" className={docLink}>Upload your data</Link> by hand instead.</li>
        <li><Link href="/docs/guides/privacy" className={docLink}>Privacy and your data</Link>: what an upload carries.</li>
        <li><Link href="/docs/guides/troubleshooting" className={docLink}>Troubleshooting</Link>: when the app cannot find the game, or an upload is refused.</li>
      </List>
    </DocPage>
  );
}
