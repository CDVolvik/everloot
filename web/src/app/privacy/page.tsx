import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Everloot handles your data, cookies, and information shared with advertising partners.",
  alternates: { canonical: "/privacy" },
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
          <strong>Analytics:</strong> no analytics service is currently enabled.
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
          but reads only your identity and BattleTag. Provider access tokens are
          not stored. The essential login cookie lasts up to 30 days; signing out
          revokes that Everloot session. Signing in does not publish your named
          addon records or establish guild officer authority.
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
          <strong>Cookies:</strong> we use cookies for session preferences and,
          if advertising is enabled in the future, for Google AdSense (see below).
        </li>
      </ul>

      <h2 className="text-xl text-fg mt-6">
        Advertising and Google AdSense
      </h2>
      <p className="text-fg-2">
        Everloot does not currently show ads. If advertising is enabled later,
        Google AdSense will load only after you accept optional cookies. Google
        and its partners may use cookies to serve ads based on your prior visits
        to this site or other sites. You can opt out of personalized advertising
        by visiting{" "}
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
        Rejecting does not load advertising scripts. If ads already loaded,
        withdrawing consent reloads the page without optional scripts. You can
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
