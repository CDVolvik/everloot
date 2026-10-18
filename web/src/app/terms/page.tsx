import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { KEYS_PER_ACCOUNT } from "@/lib/api-keys";
import { CC_BY_SA, CONTACT_EMAIL, NON_AFFILIATION, TRADEMARK_LINE } from "@/lib/jsonld";
import { REPO_URL } from "@/lib/source";

const description = "The terms for using everloot.app, its API and MCP server, and the Everloot addon: your uploads, free API keys, licences, takedowns and warranty.";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Terms of Use", description, path: "/terms" }),
};

const link = "text-accent hover:underline underline-offset-4";
const UPDATED = "18 October 2026";
const HISTORY_URL = `${REPO_URL}/commits/main/web/src/app/terms/page.tsx`;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8 space-y-3">
      <h2 id={id} className="text-xl text-fg">{title}</h2>
      {children}
    </section>
  );
}

export default function TermsPage() {
  return (
    <article className="prose prose-invert max-w-3xl">
      <h1 className="text-3xl font-bold text-fg">Terms of Use</h1>
      <p className="text-sm text-muted">Last updated: {UPDATED}</p>
      <p className="text-fg-2">
        These terms cover everloot.app, its APIs and MCP server, the Everloot addon and the companion (together,
        &ldquo;Everloot&rdquo;). By using any of them you agree to these terms. They are written to be read, not skimmed;
        if something is unclear, ask at <a href={`mailto:${CONTACT_EMAIL}`} className={link}>{CONTACT_EMAIL}</a>.
      </p>
      <p className="text-fg-2">
        Everloot is an independent fan project. {NON_AFFILIATION} How your data is handled is in the{" "}
        <Link href="/privacy" className={link}>Privacy Policy</Link>; how uploads become facts is on{" "}
        <Link href="/methodology" className={link}>How we count</Link>.
      </p>

      <Section id="use" title="Using Everloot">
        <p className="text-fg-2">
          Browsing is free and needs no account. A few clearly labelled ads pay for hosting. You may use the site, the API and
          the MCP server for any lawful purpose, within the rate limits on the{" "}
          <Link href="/connect" className={link}>Connect page</Link>. Do not try to get around those limits, probe or attack
          the service, send uploads you have forged or altered, or use other players&apos; data in ways the{" "}
          <Link href="/privacy" className={link}>Privacy Policy</Link> rules out. We may limit or block access that does.
        </p>
      </Section>

      <Section id="uploads" title="Your uploads">
        <p className="text-fg-2">
          When you upload what the addon recorded, you confirm that the file came from your own game client and that you have
          the right to share it. You preview everything before it is sent. Guild data publishes only through an officer&apos;s
          upload, and named records only with that person&apos;s explicit sharing choice.
        </p>
        <p className="text-fg-2">
          You license the observations you upload to everyone under{" "}
          <a href={CC_BY_SA.url} rel="noopener" className={link}>{CC_BY_SA.name}</a>, credited to Everloot contributors. That
          licence is the point of the project: anyone can check our counts and build on them. It is not revocable for copies
          already made, but you can withdraw a sharing grant on the upload page, and you can ask us by email to remove your
          uploads; we will, and the next rollup rebuild drops them.
        </p>
        <p className="text-fg-2">
          We may remove or hold back any upload: for example one that fails validation, looks forged, or spoils content
          Blizzard has not released. We never sell uploads.
        </p>
      </Section>

      <Section id="accounts" title="Accounts and Battle.net sign-in">
        <p className="text-fg-2">
          Signing in uses your Battle.net account. Everloot stores your Battle.net Account ID and BattleTag to manage your
          account and sharing choices, and nothing else from Battle.net; your Battle.net account itself is governed by
          Blizzard&apos;s terms. Keep your own account secure and do not use someone else&apos;s. To delete your Everloot
          account and everything tied to it, email us.
        </p>
      </Section>

      <Section id="api" title="API, MCP server and keys">
        <p className="text-fg-2">
          Reading the public data needs no key. Copying it in bulk takes a free key, up to {KEYS_PER_ACCOUNT} keys per
          account. A key is yours: do not share it or embed it where others can read it. We may revoke a key that is abused or
          that breaks these terms, and we may change limits and endpoints; changes are listed on the Connect page and in the
          repository.
        </p>
        <p className="text-fg-2">
          Everything the API and the MCP server return carries a licence and a credit line. Keep them with the data when you
          republish it. The service is offered as it stands, without a promise of uptime.
        </p>
      </Section>

      <Section id="licences" title="Content and licences">
        <ul className="list-disc pl-6 text-fg-2 space-y-2">
          <li>
            <span className="text-fg">Code</span> (the site, the addon, the companion, the knowledge base): AGPL-3.0. The{" "}
            <a href={REPO_URL} rel="noopener" className={link}>source</a> is public, and the footer links the exact deployed
            commit.
          </li>
          <li>
            <span className="text-fg">Player data</span> (observations uploaded by players, and the facts derived from them):{" "}
            {CC_BY_SA.name}, credited to Everloot contributors.
          </li>
          <li>
            <span className="text-fg">Game data</span> (anything read from the game files, and Blizzard&apos;s icons, tooltip
            text and interface art shown on some pages): Blizzard Entertainment&apos;s, shown as facts with the build it came
            from, labelled unconfirmed until seen in play, and not under our licences. The rules are in the{" "}
            <a href={`${REPO_URL}/blob/main/docs/DATA_POLICY.md`} rel="noopener" className={link}>data policy</a>.
          </li>
          <li>
            <span className="text-fg">Lore</span>: Warcraft Wiki text as of 13 November 2023, {CC_BY_SA.name}, credited and
            linked on every page.
          </li>
          <li>
            <span className="text-fg">Everything else on the pages</span> (our words, layout and design): ours, under the
            same {CC_BY_SA.name} licence as the data unless a page says otherwise.
          </li>
        </ul>
        <p className="text-fg-2">
          Every third-party source and its licence is listed in{" "}
          <a href={`${REPO_URL}/blob/main/THIRD_PARTY.md`} rel="noopener" className={link}>THIRD_PARTY.md</a>.
        </p>
      </Section>

      <Section id="trademarks" title="Trademarks">
        <p className="text-fg-2">
          &ldquo;Everloot&rdquo;, the Everloot logo and the everloot.app domain are not covered by the licences above. You may say
          that your project is based on Everloot, links to it or works with it. Please do not publish a fork, addon, site or
          app under the Everloot name or logo, or in a way that makes it look official; give yours its own name. Details:{" "}
          <a href={`${REPO_URL}/blob/main/TRADEMARKS.md`} rel="noopener" className={link}>TRADEMARKS.md</a>.
        </p>
        <p className="text-fg-2">{TRADEMARK_LINE} Everloot is a fan project and is not affiliated with or endorsed by Blizzard.</p>
      </Section>

      <Section id="takedown" title="Copyright and takedown">
        <p className="text-fg-2">
          If you believe something on Everloot infringes your rights, or is yours and you want it removed, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}?subject=Takedown`} className={link}>{CONTACT_EMAIL}</a> with &ldquo;Takedown&rdquo; in the
          subject. Tell us the page or file, what the material is, why you have the right to ask, and how to reach you. A
          maintainer removes material we are not entitled to show promptly, from the site first and from later data releases
          after that. Blizzard, or anyone speaking for Blizzard, can ask the same way. Addon authors can ask to be left out of
          the addon tracker with the ecosystem issue form or by email.
        </p>
      </Section>

      <Section id="warranty" title="No warranty, limited liability">
        <p className="text-fg-2">
          Everloot is provided as it is and as available, by volunteers, free of charge. Data read from the game files is
          unconfirmed, player-reported facts depend on who reported them, and a page that says <em>unrecorded</em> means exactly
          that. We make no warranty that the service or its data is accurate, complete, uninterrupted or fit for a purpose. To
          the extent the law allows, Everloot and the people who run it are not liable for any loss arising from using it or
          relying on it, and our total liability to you is limited to the amount you paid us, which is nothing.
        </p>
      </Section>

      <Section id="law" title="Governing law">
        <p className="text-fg-2">
          These terms are governed by the laws of the State of Arizona, United States, without regard to conflict-of-law rules.
          Any dispute that cannot be settled by email goes to the state or federal courts located in Arizona, and you agree to
          their jurisdiction. If a part of these terms turns out to be unenforceable, the rest still applies.
        </p>
      </Section>

      <Section id="changes" title="Changes to these terms">
        <p className="text-fg-2">
          We may change these terms. The date at the top is the date of the current version, and because this page lives in
          the open repository, <a href={HISTORY_URL} rel="noopener" className={link}>every past version and its diff</a> is
          public. Using Everloot after a change means you accept the new terms.
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <p className="text-fg-2">
          Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`} className={link}>{CONTACT_EMAIL}</a>, or the{" "}
          <Link href="/contact" className={link}>contact page</Link>.
        </p>
      </Section>
    </article>
  );
}
