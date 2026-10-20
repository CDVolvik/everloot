import type { Metadata } from "next";
import Link from "next/link";
import { Callout, C, H2, List, P, docLink } from "@/components/docs/blocks";
import DocPage from "@/components/docs/DocPage";
import { KEYS_PER_ACCOUNT } from "@/lib/api-keys";
import { savedBuildsOn } from "@/lib/saved-builds";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Your Everloot account",
  description: "What an Everloot account is for today, how to sign in, and how to make and revoke API keys.",
  path: "/docs/guides/account",
});

export default function Page() {
  // Read at build time, like the keys page: switching saved builds on takes a redeploy, which rebuilds this page.
  const builds = savedBuildsOn();
  return (
    <DocPage href="/docs/guides/account">
      <P>
        {builds
          ? <>An account is for two things today: saving talent builds and making API keys.</>
          : <>An account is for one thing today: making API keys.</>}{" "}
        You do not need one to read the site, search, use the tools or upload your addon data. The API works without one too, within the limits described below.
      </P>

      <H2 id="signing-in">Signing in</H2>
      <P>
        Go to <Link href="/sign-in" className={docLink}>the sign-in page</Link>. It shows the ways to sign in that are
        available right now. There are two kinds:
      </P>
      <List>
        <li><strong>Battle.net.</strong> Your first sign-in makes the account.</li>
        <li><strong>Email.</strong> You make an account with your email address, a name and a password, and confirm the address from the link we send. This is offered only when it is switched on. If it is, <Link href="/sign-up" className={docLink}>the sign-up page</Link> has the form. If it is not, that page says email sign-up is not open yet.</li>
      </List>
      <P>
        If you are already signed in, the sign-in page sends you to your account. Sign-in is not required for anything else.
      </P>
      <Callout kind="note">
        <p>
          Signing in does not publish your named addon records, and it does not make you a guild officer. Named sharing
          is a separate choice on the <Link href="/docs/guides/upload" className={docLink}>upload page</Link>.
        </p>
      </Callout>

      <H2 id="your-account">Your account page</H2>
      <P>
        <Link href="/account" className={docLink}>Your account</Link> shows your name, the email on the account if it
        has one, and how you sign in. If you signed up with email and a password, it also links to changing your
        password.{builds ? <> A link takes you to <Link href="/me" className={docLink}>My builds</Link>, where your saved talent builds and characters are.</> : null}{" "}
        Below that is the list of your API keys.
      </P>

      <H2 id="api-keys">API keys</H2>
      <P>
        An API key is a free token you send with requests to the Everloot API and the MCP server. Every endpoint works
        without one, within the limits on the <Link href="/docs/api/keys" className={docLink}>limits and keys page</Link>,
        which also says how to send a key.
      </P>
      <List>
        <li>Make a key on your account page. You can give it a label, such as what it is for, up to 60 characters.</li>
        <li>A key starts with <C>evl_</C>. It is shown once, when you make it, so copy it then. We store only a one-way hash of it.</li>
        <li>You can have {KEYS_PER_ACCOUNT} keys at a time. Revoke one to make another.</li>
        <li>The list shows the last four characters of each key, its label, when it was made and when it was last used.</li>
        <li>Revoking a key stops it at once.</li>
        {builds && <li>A key made with <strong>Read my saved builds</strong> can also read your saved builds. The Desktop App uses one to put your builds in the game.</li>}
      </List>
      <Callout kind="warning">
        <p>
          Treat a key like a password. Do not put it in a web page, a public repository or a script you share.
        </p>
      </Callout>
      <P>
        If keys are not switched on, the account page says so, and every endpoint keeps working without one.
      </P>

      <H2 id="your-data">Your data</H2>
      <P>
        What we store about an account, and how to have it deleted, is in the{" "}
        <Link href="/privacy" className={docLink}>Privacy Policy</Link>. The short version is in{" "}
        <Link href="/docs/guides/privacy" className={docLink}>privacy and your data</Link>.
      </P>
    </DocPage>
  );
}
