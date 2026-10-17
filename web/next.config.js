const path = require("node:path");

const reportOnlyCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://www.googletagmanager.com https://eu.i.posthog.com https://us.i.posthog.com https://eu-assets.i.posthog.com https://us-assets.i.posthog.com https://pagead2.googlesyndication.com",
  "connect-src 'self' https://cloudflareinsights.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://eu.i.posthog.com https://us.i.posthog.com https://pagead2.googlesyndication.com",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Native module: required at runtime from web/node_modules, never bundled.
  serverExternalPackages: ["better-sqlite3"],
  // The approved knowledge release ships inside the /mcp function only (copied to web/.release, never committed).
  outputFileTracingIncludes: {
    "/mcp": ["./.release/*.sqlite", "./.release/*.manifest.json"],
    "/mcp/public": ["./.release/*.sqlite", "./.release/*.manifest.json"],
    "/lore/[slug]": ["./.release/*.sqlite", "./.release/*.manifest.json"],
    "/lore": ["./.release/*.sqlite", "./.release/*.manifest.json"],
    "/search": ["./.release/*.sqlite", "./.release/*.manifest.json"],
    "/lore-sitemap.xml": ["./.release/*.sqlite", "./.release/*.manifest.json"],
    "/lore-sitemap/[n]": ["./.release/*.sqlite", "./.release/*.manifest.json"],
    "/lore/browse/[type]": ["./.release/*.sqlite", "./.release/*.manifest.json"],
    "/lore/coverage": ["./.release/*.sqlite", "./.release/*.manifest.json"],
    "/lore-sitemap/pages.xml": ["./.release/*.sqlite", "./.release/*.manifest.json"],
  },
  // /lore/[slug] already owns one dynamic segment under /lore, so the browse pages live at
  // /lore/browse/<type> and are served at the short URL. afterFiles rewrites run before dynamic routes.
  async rewrites() {
    return [{ source: "/lore/:type(npcs|items|quests|zones|spells)", destination: "/lore/browse/:type" }];
  },
  // One page, one URL: the internal route name is never a second address. Redirects match the
  // original URL, so this does not loop with the rewrite above. The source is constrained to the
  // five real types so an unknown /lore/browse/<type> 404s directly instead of a permanent
  // redirect out of the internal route.
  async redirects() {
    return [{ source: "/lore/browse/:type(npcs|items|quests|zones|spells)", destination: "/lore/:type", permanent: true }];
  },
  // Security headers on every route. The CSP is report-only: it lists what the site loads (the analytics and ads
  // scripts only start after consent) and enforces nothing, so a missed host shows in the console, not as a
  // broken page. Access-Control-Allow-Origin is not set here: the `*` seen on pages is added by Vercel for
  // prerendered responses, and a header set here could not remove it.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  webpack(config, { isServer }) {
    // kb/src/db.ts would otherwise resolve better-sqlite3 through kb/node_modules and bundle it.
    if (isServer) config.externals = [...[].concat(config.externals ?? []), { "better-sqlite3": "commonjs better-sqlite3" }];
    // Shared KB sources use NodeNext .js imports for their TypeScript modules.
    // https://webpack.js.org/configuration/resolve/#resolveextensionalias
    config.resolve.extensionAlias = { ...config.resolve.extensionAlias, ".js": [".js", ".ts", ".tsx"] };
    // kb/src imports packages that a Vercel build installs only under web/node_modules.
    config.resolve.modules = [...(config.resolve.modules ?? ["node_modules"]), path.join(__dirname, "node_modules")];
    return config;
  },
  // Adjust this when the production domain is set
  // e.g. metadataBase is read from the layout, not here
};

module.exports = nextConfig;
