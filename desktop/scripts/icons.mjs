// Makes the app and tray icons from the site's icon (web/src/app/icon.svg) with web's sharp.
// Run once after the SVG changes; the PNGs are committed.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sharp = createRequire(join(root, "..", "web", "package.json"))("sharp");
const svg = readFileSync(join(root, "..", "web", "src", "app", "icon.svg"));
const out = join(root, "build");
mkdirSync(out, { recursive: true });

// App icon: electron-builder makes the .ico and .icns from a 512 px PNG.
writeFileSync(join(out, "icon.png"), await sharp(svg).resize(512, 512).png().toBuffer());
// Tray on Windows and Linux: the coloured mark, small.
writeFileSync(join(out, "tray.png"), await sharp(svg).resize(32, 32).png().toBuffer());
// Tray on macOS: a black mark on transparent, which the menu bar recolours (a "template" image).
const template = (size) => sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 12 52 32 32 52 12 32Z" fill="none" stroke="#000" stroke-width="7" stroke-linejoin="round"/></svg>`,
)).resize(size, size).png().toBuffer();
writeFileSync(join(out, "trayTemplate.png"), await template(16));
writeFileSync(join(out, "trayTemplate@2x.png"), await template(32));
console.log(`icons written to ${out}`);
