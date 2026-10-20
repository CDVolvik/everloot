import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { CONTACT_EMAIL } from "@/lib/jsonld";
import { REPO_URL } from "@/lib/source";
import { trailFor } from "@/lib/breadcrumbs";
import { Container, PageHeader, Prose, SectionHeading } from "@/components/ui";

const description = "How to report a security problem in everloot.app, its APIs, the MCP server or the addon privately, what is in scope, and what to expect from us.";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Security", description, path: "/security" }),
};

const ADVISORY_URL = `${REPO_URL}/security/advisories/new`;

// The same policy as SECURITY.md in the repository, for people who find the site first.
export default function SecurityPage() {
  return (
    <Container width="reading">
      <article>
        <PageHeader trail={trailFor("/security")!} title="Security" lede={description} />
        <Prose>
          <section aria-labelledby="report">
            <SectionHeading id="report">How to report</SectionHeading>
            <p>
              Please do not report security problems in public issues, discussions or Discord. Report them privately, either through{" "}
              <a href={ADVISORY_URL} rel="noopener">GitHub&apos;s private vulnerability reporting</a> or by email to{" "}
              <a href={`mailto:${CONTACT_EMAIL}?subject=Security`}>{CONTACT_EMAIL}</a> with &ldquo;Security&rdquo; in the
              subject. Include what you found, how to reproduce it, and what an attacker could do with it.
            </p>
            <p>
              The same contacts are published in the machine-readable{" "}
              <a href="/.well-known/security.txt">security.txt</a> file.
            </p>
          </section>

          <section aria-labelledby="expect">
            <SectionHeading id="expect">What to expect</SectionHeading>
            <p>
              We will answer within a few days and keep you posted until it is fixed. Once a fix is live we are happy to credit you,
              if you want.
            </p>
          </section>

          <section aria-labelledby="scope">
            <SectionHeading id="scope">In scope</SectionHeading>
            <p>
              everloot.app and its APIs, the MCP endpoints, the addon, the companion and the{" "}
              <a href={REPO_URL} rel="noopener">repository</a>. Please do not test against other players&apos; data, run
              load tests against the site, or use social engineering.
            </p>
          </section>

          <section aria-labelledby="in-place">
            <SectionHeading id="in-place">What the site already does</SectionHeading>
            <p>
              The code is open, so you can read what runs. Uploads are previewed before they are sent and published without
              install ids, and without names unless the player granted sharing, the way the{" "}
              <a href="/methodology">methodology</a> describes. Passwords are never
              handled here: sign-in goes through Battle.net, and Everloot stores no provider tokens.
            </p>
          </section>
        </Prose>
      </article>
    </Container>
  );
}
