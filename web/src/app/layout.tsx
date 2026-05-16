import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://goldgoblin.gg";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "GoldGoblin.gg — World of Warcraft Utility Tools",
    template: "%s · GoldGoblin.gg",
  },
  description:
    "Free World of Warcraft tools: gold farming calculator, profession planner, completionist tracker. Built for players, by players.",
  keywords: [
    "world of warcraft tools",
    "wow calculator",
    "wow utilities",
    "wow gold calculator",
    "wow profession planner",
  ],
  openGraph: {
    type: "website",
    siteName: "GoldGoblin.gg",
    title: "GoldGoblin.gg — World of Warcraft Utility Tools",
    description:
      "Free WoW tools: gold farming calculator, profession planner, completionist tracker.",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "GoldGoblin.gg — World of Warcraft Utility Tools",
    description:
      "Free WoW tools: gold farming calculator, profession planner, completionist tracker.",
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
