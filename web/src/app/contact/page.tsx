import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact the Everloot team by email for corrections, privacy requests, bug reports, and partnership questions.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <article className="prose prose-invert max-w-3xl">
      <h1 className="text-3xl font-bold text-fg">
        Contact Everloot
      </h1>

      <p className="text-fg-2">
        Everloot is an independent fan project run by a small team; the fastest
        way to reach us is email.
      </p>

      <p className="text-fg-2">
        <a
          className="text-accent hover:underline underline-offset-4"
          href="mailto:hello@everloot.app"
        >
          hello@everloot.app
        </a>
      </p>

      <h2 className="text-xl text-fg mt-8">
        What to email about
      </h2>
      <ul className="list-disc pl-6 text-fg-2">
        <li>Data corrections or wrong drop rates</li>
        <li>
          Privacy and data requests (see also our{" "}
          <Link
            href="/privacy"
            className="text-accent hover:underline underline-offset-4"
          >
            Privacy Policy
          </Link>
          )
        </li>
        <li>Bug reports</li>
        <li>Advertising or partnership questions</li>
      </ul>

      <h2 className="text-xl text-fg mt-8">
        Not affiliated with Blizzard
      </h2>
      <p className="text-fg-2">
        Everloot is not affiliated with Blizzard Entertainment. Account or game
        support questions belong with Blizzard.
      </p>
    </article>
  );
}
