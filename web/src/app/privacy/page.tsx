import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Everloot handles your data, cookies, and information shared with advertising partners.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const updated = "April 2026";
  return (
    <article className="prose prose-invert max-w-3xl">
      <h1 className="font-display text-3xl font-bold text-parchment-100">
        Privacy Policy
      </h1>
      <p className="text-sm text-parchment-100/60">Last updated: {updated}</p>

      <h2 className="font-display text-xl text-parchment-100 mt-6">Overview</h2>
      <p className="text-parchment-100/80">
        Everloot (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides free utility
        tools for World of Warcraft players. We value your privacy and try to
        collect the minimum information possible.
      </p>

      <h2 className="font-display text-xl text-parchment-100 mt-6">
        Information we collect
      </h2>
      <p className="text-parchment-100/80">
        Most of our tools run entirely in your browser. Data you enter into a
        calculator is not sent to our servers unless you explicitly generate a
        share link.
      </p>
      <ul className="list-disc pl-6 text-parchment-100/80">
        <li>
          <strong>Analytics:</strong> we may use privacy-respecting analytics
          (e.g. Plausible) to understand which tools are used.
        </li>
        <li>
          <strong>Email (optional):</strong> if you sign up to be notified when
          an upcoming tool launches, we store your email to send you that single
          notification.
        </li>
        <li>
          <strong>Cookies:</strong> we use cookies for session preferences and,
          where enabled, for advertising via Google AdSense (see below).
        </li>
      </ul>

      <h2 className="font-display text-xl text-parchment-100 mt-6">
        Advertising and Google AdSense
      </h2>
      <p className="text-parchment-100/80">
        Once approved, this site may display ads served by Google AdSense. Google
        and its partners may use cookies to serve ads based on your prior visits
        to this site or other sites. You can opt out of personalized advertising
        by visiting{" "}
        <a
          className="text-gold-400 hover:underline"
          href="https://www.google.com/settings/ads"
          target="_blank"
          rel="noreferrer"
        >
          Google Ads Settings
        </a>
        . For more detail, see{" "}
        <a
          className="text-gold-400 hover:underline"
          href="https://policies.google.com/technologies/ads"
          target="_blank"
          rel="noreferrer"
        >
          How Google uses advertising cookies
        </a>
        .
      </p>

      <h2 className="font-display text-xl text-parchment-100 mt-6">
        Your choices
      </h2>
      <p className="text-parchment-100/80">
        You can reject non-essential cookies using the banner at the bottom of
        any page. You can clear local storage at any time through your browser
        settings.
      </p>

      <h2 className="font-display text-xl text-parchment-100 mt-6">Contact</h2>
      <p className="text-parchment-100/80">
        Questions? Email{" "}
        <a className="text-gold-400 hover:underline" href="mailto:hello@everloot.app">
          hello@everloot.app
        </a>
        .
      </p>
    </article>
  );
}
