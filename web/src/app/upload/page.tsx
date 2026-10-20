import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import { latestAddonRelease } from "@/lib/addon-release";
import { softwareApplicationJsonLd } from "@/lib/jsonld";
import { REPO_URL } from "@/lib/source";
import { playerPagesOn } from "@/lib/player-pages";
import { Card, Container, PageHeader, SectionHeading } from "@/components/ui";
import { trailFor } from "@/lib/breadcrumbs";
import UploadClient from "./UploadClient";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Upload WoW Forever Addon Data", description: "Download the Everloot addon for WoW: Forever and upload what it collected. You preview everything before it is sent, and no account is needed.", path: "/upload" }),
};

const ADDON_DESCRIPTION = "A beta addon that records what happens around you while you play, for upload to Everloot.";
const LICENCE_NAME = "AGPL-3.0";
const LICENCE_URL = "https://www.gnu.org/licenses/agpl-3.0.html";
const link = "text-accent hover:underline underline-offset-4";

export default function UploadPage() {
  const addon = latestAddonRelease();
  return (
    <Container width="reading">
      {addon && <JsonLd data={softwareApplicationJsonLd({ name: "Everloot addon", description: ADDON_DESCRIPTION, version: addon.version, downloadPath: addon.downloadPath, licenceUrl: LICENCE_URL, path: "/upload" })} />}
      <PageHeader
        title="Upload addon data"
        lede="Collected by the Everloot addon while you play. You preview exactly what goes out before anything is sent."
        trail={trailFor("/upload")!}
      />
      <div className="space-y-6">
        <p className="text-fg-2">
          Open-world sightings stay anonymous, and guild data publishes only through your officers.
          Uploaded observations are published under CC BY-SA 4.0, credited to Everloot contributors.
        </p>
        <Card as="section" aria-labelledby="collect">
          <SectionHeading id="collect" note={ADDON_DESCRIPTION}>Collect data in the beta</SectionHeading>
          <div className="space-y-3 text-fg-2">
            {addon ? (
              <>
                <p>Extract the Everloot folder into Interface/AddOns, reload the client, and check /everloot status. Version {addon.version} has passed automated checks; testing in the Forever client is still pending.</p>
                <p><a className={link} href={addon.downloadPath} download>Download beta addon {addon.version}</a></p>
                <p className="text-sm">Licence: {LICENCE_NAME}. <a className={link} href={REPO_URL} rel="noopener">Source code</a>.</p>
                <p className="text-sm">Checksums, install steps and the Desktop App, which uploads for you after each logout, are on the <Link className={link} href="/addon">downloads page</Link>.</p>
              </>
            ) : (
              <p>The addon download is not available right now.</p>
            )}
            <p className="text-sm">Log out before selecting Everloot.lua from your account’s SavedVariables folder below. Keep a backup. Named records need your explicit sharing choice and verified authority.</p>
          </div>
        </Card>
        <UploadClient playerPages={playerPagesOn()} />
      </div>
    </Container>
  );
}
