import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Privacy Policy", description: "How Everloot handles your data, cookies and usage statistics, and what happens to the addon files you upload to the WoW: Forever database.", path: "/privacy" }),
};

export default function PrivacyPage() {
  const updated = "October 2026";
  return (
    <article className="prose prose-invert max-w-3xl">
      <h1 className="text-3xl font-bold text-fg">
        Privacy Policy
      </h1>
      <p className="text-sm text-muted">Last updated: {updated}</p>

      <h2 className="text-xl text-fg mt-6">Overview</h2>
      <p className="text-fg-2">
        Everloot (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides free utility
        tools for World of Warcraft players. We value your privacy and try to
        collect the minimum information possible.
      </p>

      <h2 className="text-xl text-fg mt-6">
        Information we collect
      </h2>
      <p className="text-fg-2">
        Most of our tools run entirely in your browser. Data you enter into a
        calculator stays in your browser. A calculator share link encodes those
        values in the URL; anyone you give that link to can read them.
      </p>
      <ul className="list-disc pl-6 text-fg-2">
        <li>
          <strong>Analytics:</strong> the tools listed under &ldquo;Analytics&rdquo;
          below. Each one is switched on only when we configure it, and the
          ones that use cookies or browser storage wait for your consent.
        </li>
        <li>
          <strong>Our own counters:</strong> our servers keep a daily count of
          calls to our API and to the public MCP endpoint, by endpoint or tool
          name. These counts contain no IP address, install id, search text or
          other detail about who made the call. Rate limiting separately keeps
          a one-way hash of an address for a short time to enforce limits.
        </li>
        <li>
          <strong>Email (optional):</strong> if you sign up to be notified when
          an upcoming tool launches, we store your email to send you that single
          notification.
        </li>
        <li>
          <strong>Battle.net sign-in:</strong> we store your Battle.net Account ID
          and BattleTag to manage your account and sharing choices. The current
          sign-in flow requests identity and World of Warcraft profile permissions,
          but reads only your identity and BattleTag. We don&apos;t keep your
          Battle.net access token, or any other token Battle.net sends, after you
          sign in. Your session is a random token in an essential cookie. It lasts
          30 days and renews while you use the site. It is stored with no IP address
          and no browser details, and signing out ends it. Signing in does not
          publish your named addon records or establish guild officer authority.
        </li>
        <li>
          <strong>API keys (optional):</strong> if you make a free API key on the
          Connect page, we store a one-way hash of it, the last four characters,
          your label, which account it belongs to, when it was made, last used
          and revoked, and a daily count of its requests per endpoint. Not what
          was asked. Revoking a key stops it at once. Daily counts are kept 90
          days. A revoked key and its counts are deleted 30 days after it was
          revoked, or at once when you delete it on the Connect page. To delete
          your account and everything tied to it, email us (below).
        </li>
        <li>
          <strong>Uploads:</strong> files you send on the upload page
          (addon records plus a random install id — no account, no character
          login). Your anonymous observations are published as individual
          records without the install id, so anyone can check our counts. The
          facts the site states, such as drop rates, spawn points and recipe
          ranges, appear only after at least three installs report them.
          Install IDs are not proof of independent people. Guild data publishes only through an authorized officer upload. A
          character owner with a verified sharing grant can opt out on the upload
          page; anyone else can ask us by email (below). Uploads build the public database; we never
          sell them.
        </li>
        <li>
          <strong>Cookies:</strong> an essential login cookie if you sign in (plus a
          short-lived one, 10 minutes, that holds the sign-in state while you are at
          Battle.net), and your cookie choice, which is saved in your browser. Optional analytics
          cookies are off unless you accept them. Advertising cookies come from
          Google AdSense and are covered below.
        </li>
      </ul>

      <h2 className="text-xl text-fg mt-6">Analytics</h2>
      <p className="text-fg-2">
        We may use the following, and only while they are configured. Anything
        that sets cookies or stores an identifier in your browser loads only
        after you accept analytics in the cookie banner.
      </p>
      <ul className="list-disc pl-6 text-fg-2">
        <li>
          <strong>Google Search Console and Bing Webmaster Tools</strong> show us
          how our pages appear in search. They place a verification tag in the
          page and collect nothing from your visit.
        </li>
        <li>
          <strong>Cloudflare Web Analytics</strong> counts page views and page
          speed without cookies. It does not run if your browser sends Do Not
          Track or Global Privacy Control.
        </li>
        <li>
          <strong>PostHog</strong> (consent required) records which features are
          used, such as a search or an upload finishing. We send no search text,
          names or file contents, and session recording is off.
        </li>
        <li>
          <strong>Google Analytics</strong> (consent required) measures page views
          and visits using cookies.
        </li>
      </ul>

      <h2 className="text-xl text-fg mt-6">
        Advertising and Google AdSense
      </h2>
      <p className="text-fg-2">
        Everloot shows ads from Google AdSense, each one labelled
        &ldquo;Advertisement&rdquo;, on the tools, the patch notes, the home page and
        database pages that have content. There are no ads on the upload page, this
        page, account pages or the lore archive. Google and its partners may use
        cookies to serve ads based on your prior visits to this site or other
        sites. In the EEA, the UK and Switzerland, Google&apos;s consent message asks
        you first and ads use only what you allow. In US states with privacy
        laws, the same message lets you opt out of the sale or sharing of your
        information. You can opt out of personalized advertising anywhere by
        visiting{" "}
        <a
          className="text-accent hover:underline"
          href="https://www.google.com/settings/ads"
          target="_blank"
          rel="noreferrer"
        >
          Google Ads Settings
        </a>
        . For more detail, see{" "}
        <a
          className="text-accent hover:underline"
          href="https://policies.google.com/technologies/ads"
          target="_blank"
          rel="noreferrer"
        >
          How Google uses advertising cookies
        </a>
        .
      </p>

      <h2 className="text-xl text-fg mt-6">
        Your choices
      </h2>
      <p className="text-fg-2">
        You can accept or reject optional cookies in the banner and reopen Cookie
        preferences from the footer on any page. The choice is stored locally.
        The banner covers analytics; rejecting it loads none of the analytics
        scripts. Advertising consent, where the law requires it, is Google&apos;s
        message described above. If an optional script already loaded,
        withdrawing consent reloads the page without it and deletes the
        Google Analytics and PostHog cookies and stored keys it set on this
        site where your browser allows. Cloudflare Web Analytics, which sets
        no cookies, is the one tool that runs without a choice; it is skipped
        when your browser sends Do Not Track or Global Privacy Control. You can
        also clear local storage through your browser settings.
      </p>

      <h2 className="text-xl text-fg mt-6">Contact</h2>
      <p className="text-fg-2">
        Questions? Email{" "}
        <a className="text-accent hover:underline" href="mailto:hello@everloot.app">
          hello@everloot.app
        </a>
        .
      </p>
    </article>
  );
}
