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
