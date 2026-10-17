import type { Metadata } from "next";
import UploadClient from "./UploadClient";

export const metadata: Metadata = {
  title: "Upload data",
  description:
    "Send your Everloot addon data: drop reports, spawns, guild progression. Preview before sending, no account needed.",
  alternates: { canonical: "/upload" },
};

export default function UploadPage() {
  return (
    <div className="space-y-10 max-w-3xl mx-auto">
      <section className="pt-6 text-center">
        <p className="font-mono text-xs text-muted mb-4">
          Power the database
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold text-fg tracking-tight">
          Upload your <span className="text-accent">data</span>
        </h1>
        <p className="mt-4 text-fg-2">
          Collected by the Everloot addon while you play. You preview exactly
          what goes out before anything is sent — open-world sightings stay
          anonymous, guild data publishes only through your officers.
          Uploaded observations are published under CC BY-SA 4.0, credited to Everloot contributors.
        </p>
      </section>
      <section className="rounded-xl border border-line p-5 space-y-3">
        <h2 className="text-xl font-semibold text-fg">Collect data in the beta</h2>
        <p className="text-fg-2">Extract the Everloot folder into Interface/AddOns, reload the client, and check /everloot status. Version 0.2.6 has passed automated checks; testing in the Forever client is still pending.</p>
        <a className="inline-flex min-h-11 items-center text-accent underline" href="/downloads/Everloot-0.2.6.zip" download>Download beta addon 0.2.6</a>
        <p className="text-sm text-fg-2">Log out before selecting Everloot.lua from your account’s SavedVariables folder below. Keep a backup. Named records need your explicit sharing choice and verified authority.</p>
      </section>
      <UploadClient />
    </div>
  );
}
