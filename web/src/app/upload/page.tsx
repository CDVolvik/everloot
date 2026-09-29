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
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80 mb-4">
          Power the database
        </p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-parchment-100 tracking-tight">
          Upload your <span className="text-gold-400">data</span>
        </h1>
        <p className="mt-4 text-parchment-100/75">
          Collected by the Everloot addon while you play. You preview exactly
          what goes out before anything is sent — open-world sightings stay
          anonymous, guild data publishes only through your officers.
        </p>
      </section>
      <UploadClient />
    </div>
  );
}
