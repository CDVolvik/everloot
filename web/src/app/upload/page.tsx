import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import { latestAddonRelease } from "@/lib/addon-release";
import { softwareApplicationJsonLd } from "@/lib/jsonld";
import { REPO_URL } from "@/lib/source";
import { playerPagesOn } from "@/lib/player-pages";
import UploadClient from "./UploadClient";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Upload WoW Forever Addon Data", description: "Download the Everloot addon for WoW: Forever and upload what it collected. You preview everything before it is sent, and no account is needed.", path: "/upload" }),
};

const ADDON_DESCRIPTION = "A beta addon that records what happens around you while you play, for upload to Everloot.";
const LICENCE_NAME = "AGPL-3.0";
const LICENCE_URL = "https://www.gnu.org/licenses/agpl-3.0.html";

export default function UploadPage() {
  const addon = latestAddonRelease();
  return (
    <div className="space-y-10 max-w-3xl mx-auto">
      {addon && <JsonLd data={softwareApplicationJsonLd({ name: "Everloot addon", description: ADDON_DESCRIPTION, version: addon.version, downloadPath: addon.downloadPath, licenceUrl: LICENCE_URL, path: "/upload" })} />}
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
        <p className="text-fg-2">{ADDON_DESCRIPTION}</p>
        {addon ? (
          <>
            <p className="text-fg-2">Extract the Everloot folder into Interface/AddOns, reload the client, and check /everloot status. Version {addon.version} has passed automated checks; testing in the Forever client is still pending.</p>
            <a className="inline-flex min-h-11 items-center text-accent underline" href={addon.downloadPath} download>Download beta addon {addon.version}</a>
            <p className="text-sm text-fg-2">Licence: {LICENCE_NAME}. <a className="text-accent underline" href={REPO_URL} rel="noopener">Source code</a>.</p>
            <p className="text-sm text-fg-2">Checksums, install steps and the Desktop App, which uploads for you after each logout, are on the <Link className="text-accent underline" href="/addon">downloads page</Link>.</p>
          </>
        ) : (
          <p className="text-fg-2">The addon download is not available right now.</p>
        )}
        <p className="text-sm text-fg-2">Log out before selecting Everloot.lua from your account’s SavedVariables folder below. Keep a backup. Named records need your explicit sharing choice and verified authority.</p>
      </section>
      <UploadClient playerPages={playerPagesOn()} />
    </div>
  );
}
