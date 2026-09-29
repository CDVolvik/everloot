import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://everloot.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Everloot — WoW: Forever Database, Guild Tracker & Tools",
    template: "%s · Everloot",
  },
  description:
    "Everloot is the WoW: Forever database built from player data: drop rates, guild progression, professions, farming routes and tools. Free for players, by players.",
  keywords: [
    "wow forever database",
    "wow forever guild tracker",
    "wow forever tools",
    "wow gold calculator",
    "wow profession planner",
  ],
  openGraph: {
    type: "website",
    siteName: "Everloot",
    title: "Everloot — WoW: Forever Database, Guild Tracker & Tools",
    description:
      "Drop rates, guild progression, professions, farming routes and tools for WoW: Forever, built from player data.",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Everloot — WoW: Forever Database, Guild Tracker & Tools",
    description:
      "Drop rates, guild progression, professions, farming routes and tools for WoW: Forever, built from player data.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

  return (
    <html lang="en">
      <head>
        {adsenseClient && (
          // Google AdSense — loaded only after AdSense approval, when env var is set.
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8">
          {children}
        </main>
        <Footer />
        <CookieConsent />
      </body>
    </html>
  );
}
