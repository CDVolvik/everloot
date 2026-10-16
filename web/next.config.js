const path = require("node:path");

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
  // original URL, so this does not loop with the rewrite above.
  async redirects() {
    return [{ source: "/lore/browse/:type", destination: "/lore/:type", permanent: true }];
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
