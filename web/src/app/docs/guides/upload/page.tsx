import type { Metadata } from "next";
import Link from "next/link";
import { Callout, C, H2, List, P, Step, Steps, Table, docLink } from "@/components/docs/blocks";
import { CodeGroup } from "@/components/docs/DocsClient";
import DocPage from "@/components/docs/DocPage";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Upload your data",
  description: "Send what the Everloot addon collected, from the upload page in your browser or through the Desktop App. You preview everything before it is sent.",
  path: "/docs/guides/upload",
});

export default function Page() {
  return (
    <DocPage href="/docs/guides/upload">
      <P>
        The addon saves what it sees to a file on your computer. Nothing leaves your computer until you upload it. You
        can do that yourself in the browser, or let the Desktop App do it after each logout. You do not need an account
        either way.
      </P>
      <Callout kind="note">
        <p>
          The addon is a beta. It has passed automated checks, but testing in the WoW: Forever client is still pending.
          Keep a backup of your original file.
        </p>
      </Callout>

      <H2 id="browser">Upload in the browser</H2>
      <Steps>
        <Step title="Log out of the game" id="log-out">
          <P>The game writes the save file when you log out or type <C>/reload</C>. Log out before you pick the file.</P>
        </Step>
        <Step title="Find your file" id="find-file">
          <P>
            The addon saves to <C>Everloot.lua</C> in your account&apos;s SavedVariables folder. Keep a copy somewhere safe
            before you upload.
          </P>
          <div className="mt-6">
            <CodeGroup
              tabs={[{ label: "Path", lang: "text", code: "World of Warcraft/<game version>/WTF/Account/<account>/SavedVariables/Everloot.lua" }]}
            />
          </div>
        </Step>
        <Step title="Choose the file" id="choose">
          <P>
            Open the <Link href="/upload" className={docLink}>upload page</Link>. Drop <C>Everloot.lua</C> on it or press
            Choose file. The file stays on your computer, and the page reads it in your browser. The limit is 20 MB.
          </P>
        </Step>
        <Step title="Read the preview" id="preview">
          <P>
            The page lists each kind of record and how many it will send. It also tells you how many records it holds
            back: older records without event ids, named records you did not tick, and invalid ones. If you turned on the
            census or the installed addon list in the game, the preview says so here and counts them.
          </P>
        </Step>
        <Step title="Choose what to share" id="consent">
          <P>
            Anonymous sightings are included. Named categories start unticked, and sharing one needs a verified grant.
            The page does not ask for account credentials.
          </P>
          <Table
            head={["Category", "Needs"]}
            rows={[
              ["Guild roster, attendance, progression and loot", "Verified officer authority"],
              ["My character's gear", "Verified ownership"],
              ["My character's gold and money events", "Verified ownership"],
              ["My collection ownership and completion progress", "Verified ownership"],
            ]}
          />
          <P>
            Everloot issues scoped grants after reviewing officer or owner evidence. An addon claim token is not
            verification. Without a grant, named records stay out of the upload.
          </P>
        </Step>
        <Step title="Send" id="send">
          <P>
            Press Send upload. The page sends the file in batches and moves on only when the server confirms each one. If
            the connection drops, keep your file and press Resume upload: batches already confirmed are kept, and
            reselecting the same file safely retries the same events.
          </P>
        </Step>
      </Steps>

      <H2 id="desktop">Upload with the Desktop App</H2>
      <P>
        The <Link href="/docs/guides/desktop" className={docLink}>Desktop App</Link> finds your save files, then uploads
        after every logout or <C>/reload</C>. It sends only anonymous open-world events. Named data (guild, gear, gold,
        collection) stays on your computer, so if you want to share those, use the upload page.
      </P>

      <H2 id="after">What happens next</H2>
      <P>
        Your anonymous observations are published as individual records, without character names and without the
        addon&apos;s install id. A fact such as a drop rate, a spawn point or a vendor price appears on the site only after
        3 installs have reported it. Until then it waits.
      </P>
      <List>
        <li>Guild data publishes only through an authorised officer&apos;s upload.</li>
        <li>Uploaded observations are published under CC BY-SA 4.0, credited to Everloot contributors.</li>
        <li>Installed addon lists and census rows are never published one by one, only as counts.</li>
      </List>
      <P>
        Distinct install ids do not prove independent players, so the site says &quot;3 installs&quot;, not &quot;3 players&quot;.
        See <Link href="/docs/guides/privacy" className={docLink}>privacy and your data</Link> for the full picture.
      </P>

      <H2 id="withdraw">Change your mind</H2>
      <P>
        At the bottom of the upload page, Withdraw named sharing lets you revoke a grant, which withdraws the records it
        authorised. A verified character owner can also opt a character out across guild rosters, attendance, loot, gear
        and gold, and the opt-out stays in effect for later uploads. To have an anonymous upload removed, email{" "}
        <a className={docLink} href="mailto:hello@everloot.app">hello@everloot.app</a>.
      </P>
    </DocPage>
  );
}
