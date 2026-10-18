import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { CONTACT_EMAIL } from "@/lib/jsonld";
import { REPO_URL } from "@/lib/source";

const description = "How to report a security problem in everloot.app, its APIs, the MCP server or the addon privately, what is in scope, and what to expect from us.";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Security", description, path: "/security" }),
};

const link = "text-accent hover:underline underline-offset-4";
const ADVISORY_URL = `${REPO_URL}/security/advisories/new`;

// The same policy as SECURITY.md in the repository, for people who find the site first.
export default function SecurityPage() {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold text-fg">Security</h1>
      <p className="text-lg text-fg-2">{description}</p>

      <h2 className="text-xl text-fg mt-8">How to report</h2>
      <p className="text-fg-2">
        Please do not report security problems in public issues, discussions or Discord. Report them privately, either through{" "}
        <a href={ADVISORY_URL} rel="noopener" className={link}>GitHub&apos;s private vulnerability reporting</a> or by email to{" "}
        <a href={`mailto:${CONTACT_EMAIL}?subject=Security`} className={link}>{CONTACT_EMAIL}</a> with &ldquo;Security&rdquo; in the
        subject. Include what you found, how to reproduce it, and what an attacker could do with it.
      </p>
      <p className="text-fg-2 mt-3">
        The same contacts are published in the machine-readable{" "}
        <a href="/.well-known/security.txt" className={link}>security.txt</a> file.
      </p>

      <h2 className="text-xl text-fg mt-8">What to expect</h2>
      <p className="text-fg-2">
        We will answer within a few days and keep you posted until it is fixed. Once a fix is live we are happy to credit you,
        if you want.
      </p>

      <h2 className="text-xl text-fg mt-8">In scope</h2>
      <p className="text-fg-2">
        everloot.app and its APIs, the MCP endpoints, the addon, the companion and the{" "}
        <a href={REPO_URL} rel="noopener" className={link}>repository</a>. Please do not test against other players&apos; data, run
        load tests against the site, or use social engineering.
      </p>

      <h2 className="text-xl text-fg mt-8">What the site already does</h2>
      <p className="text-fg-2">
        The code is open, so you can read what runs. Uploads are previewed before they are sent and published without
        install ids, and without names unless the player granted sharing, the way the{" "}
        <a href="/methodology" className={link}>methodology</a> describes. Passwords are never
        handled here: sign-in goes through Battle.net, and Everloot stores no provider tokens.
      </p>
    </article>
  );
}
