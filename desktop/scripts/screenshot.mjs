// Takes a screenshot of the running app for the README: start it with
//   npx electron . --remote-debugging-port=9333
// then `node scripts/screenshot.mjs out.png [port] [js]`, where `js` is an optional expression run in
// the page first (to open a screen). Uses Chrome's debugging protocol over Node's WebSocket.
import { writeFileSync } from "node:fs";

const out = process.argv[2] ?? "screenshot.png";
const port = process.argv[3] ?? "9333";
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
// The fifth argument picks another target by URL fragment, for example an embedded site tool's view.
const want = process.argv[5];
const page = targets.find((t) => t.type === "page" && (want ? t.url.includes(want) : t.url.endsWith("index.html")));
if (!page) throw new Error("The app window was not found; is it running with --remote-debugging-port?");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const me = ++id;
  const on = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id !== me) return;
    ws.removeEventListener("message", on);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  };
  ws.addEventListener("message", on);
  ws.send(JSON.stringify({ id: me, method, params }));
});
if (process.argv[4]) {
  await call("Runtime.evaluate", { expression: process.argv[4], awaitPromise: true });
  await new Promise((r) => setTimeout(r, 400));
}
const { data } = await call("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(data, "base64"));
ws.close();
console.log(`wrote ${out}`);
