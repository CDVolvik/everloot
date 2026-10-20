import type { Metadata } from "next";
import Link from "next/link";
import { Callout, C, H2, List, P, Table, docLink } from "@/components/docs/blocks";
import DocPage from "@/components/docs/DocPage";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy and your data",
  description: "What an Everloot upload carries, what is published, what is never published, and how to withdraw, delete or opt out.",
  path: "/docs/guides/privacy",
});

export default function Page() {
  return (
    <DocPage href="/docs/guides/privacy">
      <Callout kind="note">
        <p>
          This page is a summary for players. The <Link href="/privacy" className={docLink}>Privacy Policy</Link> is the
          authoritative text, and the data policy in the repository covers where the data comes from. If they differ
          from this page, they win.
        </p>
      </Callout>

      <H2 id="upload-carries">What an upload carries</H2>
      <P>
        An upload is the records your addon wrote, plus a random install id. It has no account and no character login.
        You choose when to upload, and on the website you preview everything before it is sent.
      </P>
      <List>
        <li>Open-world sightings, loot, vendors and similar observations are anonymous.</li>
        <li>Named data (guild, gear, gold, collection) is sent only if you tick it and have a verified sharing grant. The Desktop App never sends it.</li>
        <li>The installed addon list is off in the game until you turn it on, and it is sent only from the upload page, after the preview.</li>
        <li>The census is on in a new install of the addon and says so once in chat. It is sent from the upload page, after the preview, or by the Desktop App if you allowed the census there.</li>
        <li>An upload that contains a scan is stored with a keyed one-way hash of the address it came from, never the address, so distinct reporters can be counted. The hash stays in private storage and is never published.</li>
      </List>

      <H2 id="published">What is published</H2>
      <List>
        <li>Your anonymous observations are published as individual records, without character names and without the install id, so anyone can check our counts. They are under CC BY-SA 4.0, credited to Everloot contributors.</li>
        <li>The facts the site states, such as drop rates, spawn points and recipe ranges, appear only after at least 3 installs report them. Distinct install ids do not prove independent players.</li>
        <li>Full auction scans are not public records. They feed market values, and a value is published when 3 distinct reporters scanned the item.</li>
        <li>Guild data is published only through an authorised officer&apos;s upload.</li>
        <li>Uploads build the public database. We never sell them.</li>
      </List>

      <H2 id="never">What is never published</H2>
      <List>
        <li>Your install id, and the address hash.</li>
        <li>The installed addon list, row by row. The site shows only counts for addons that at least 3 installs report.</li>
        <li>Census rows, row by row. Only counts, and only when a count covers at least 10 characters from at least 3 installs. Below that it reads &quot;fewer than 10&quot;.</li>
        <li>Named records, unless the person they belong to chose to share them.</li>
      </List>

      <H2 id="census">The census</H2>
      <P>
        The census counts who plays what. It is on in a new install of the addon, which says so once in chat; an install
        from before the census keeps it off until you type <C>/everloot census on</C>. It records
        race, class, level and faction for your own characters (with the realm name) and for players you target, mouse
        over or group with. It never reads another player&apos;s name, guild, gear or position.
      </P>
      <P>
        Before anything is stored, the game&apos;s id for each character is replaced with a keyed one-way hash. You can turn
        it off at any time with <C>/everloot census off</C>, which deletes every census row from your file.
      </P>

      <H2 id="grants">Sharing grants</H2>
      <P>
        Named records need your explicit choice and a verified grant. You can withdraw a grant on the{" "}
        <Link href="/upload" className={docLink}>upload page</Link> at any time, without emailing us. A verified
        character owner can also opt out across guild rosters, attendance, loot, gear and gold.
      </P>

      <H2 id="delete">Deleting and opting out</H2>
      <Table
        head={["What", "How"]}
        rows={[
          ["Named sharing", "Revoke the grant or opt the character out on the upload page."],
          ["An upload", <>Email <a key="m" className={docLink} href="mailto:hello@everloot.app">hello@everloot.app</a>. Uploads you ask us to remove are deleted, and the next rollup rebuild removes anything derived from them.</>],
          ["Your account", "Email us. Deleting an account removes the data tied to it."],
          ["An API key", "Revoke or delete it on your account page."],
          ["Census and addon list rows", <>Turn the feature off in the game: <C>/everloot census off</C> or <C>/everloot addons off</C>.</>],
        ]}
      />
      <P>
        You can also ask us what we hold about you, have it corrected, object to how we use it, or withdraw a consent.
        We answer within a month.
      </P>

      <H2 id="cookies">Cookies and analytics</H2>
      <List>
        <li>If you sign in, an essential login cookie keeps you signed in for at most 30 days after your last visit. Signing out ends it.</li>
        <li>Optional analytics cookies are off unless you accept them in the cookie banner. You can reopen Cookie preferences from the footer on any page.</li>
        <li>Cloudflare Web Analytics sets no cookies. It does not run if your browser sends Do Not Track or Global Privacy Control.</li>
        <li>Ads come from Google AdSense, each labelled &quot;Advertisement&quot;. There are no ads on the upload page, the privacy page, account pages or the lore archive.</li>
      </List>
      <P>
        The full list of tools, what each one does and how long things are kept is in the{" "}
        <Link href="/privacy" className={docLink}>Privacy Policy</Link>.
      </P>
    </DocPage>
  );
}
