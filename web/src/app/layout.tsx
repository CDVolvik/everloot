import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { fontVariables } from "./fonts";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import Breadcrumbs from "@/components/Breadcrumbs";
import { analyticsConfig } from "@/lib/analytics/config";
import { FEED } from "@/lib/seo";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://everloot.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Everloot — WoW: Forever Database, Guild Tracker & Tools",
    template: "%s · Everloot",
  },
  description:
    "WoW: Forever addon uploads, loot-window observations, guild tools and a gold-per-hour calculator. Public facts depend on available corroborated data.",
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
      "WoW: Forever observations from addon uploads, guild tools and a gold-per-hour calculator.",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Everloot — WoW: Forever Database, Guild Tracker & Tools",
    description:
      "WoW: Forever observations from addon uploads, guild tools and a gold-per-hour calculator.",
  },
  alternates: { types: FEED },
  robots: { index: true, follow: true },
  // Search Console and Bing Webmaster Tools ownership tags. Each is emitted only when its variable is set.
  verification: {
    google: process.env.GSC_VERIFICATION?.trim() || undefined,
    other: process.env.BING_VERIFICATION?.trim() ? { "msvalidate.01": process.env.BING_VERIFICATION.trim() } : undefined,
  },
  // AdSense site ownership. Emitted only when the AdSense client is configured.
  other: process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim() ? { "google-adsense-account": process.env.NEXT_PUBLIC_ADSENSE_CLIENT.trim() } : undefined,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

  return (
    <html lang="en" className={fontVariables}>
      <body className="flex flex-col min-h-screen">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-canvas focus:px-4 focus:py-3">Skip to content</a>
        <Header />
        <main id="main-content" className="flex-1 min-w-0 mx-auto w-full max-w-6xl px-4 py-8">
          <Breadcrumbs />
          {children}
        </main>
        <Footer />
        {/* AdSense loads on every page so Google's certified consent message can run where the law requires
            it (EEA, UK, Switzerland, US states). Ads themselves appear only where a page places an AdSlot. */}
        {adsenseClient && (
          <Script
            id="adsense"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsenseClient)}`}
          />
        )}
        <CookieConsent analytics={analyticsConfig()} />
      </body>
    </html>
  );
}
