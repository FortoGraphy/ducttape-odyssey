// Preview one or a few routes in isolation, so half-written routes of other agents cannot break the
// web bundle. Forwards to a Metro dev server and rewrites the expo-router root to a private folder.
//   1) create <root>/_layout.tsx:  export { default } from "<rel>/src/ui/dev/DevLayout";
//      and <root>/<route>.tsx:     export { default } from "<rel>/src/app/<route>";   (or the screen itself)
//   2) npx expo start --web --port <metroPort>          (your own Metro, in the background)
//   3) node scripts/preview/isolated.mjs <root> <listenPort> <metroPort>
//   4) node scripts/preview/shot.mjs http://localhost:<listenPort>/<route>?preset=mid out.png
import http from "node:http";

const [rootArg, listenArg, targetArg] = process.argv.slice(2);
if (!rootArg || !listenArg || !targetArg) {
  console.error("usage: isolated.mjs <routerRootDir> <listenPort> <metroPort>");
  process.exit(2);
}
const listen = Number(listenArg);
const target = Number(targetArg);
const ROOT = encodeURIComponent(rootArg.replace(/\\/g, "/").replace(/\/$/, ""));

http
  .createServer((req, res) => {
    const url = (req.url ?? "/").replace(/transform\.routerRoot=[^&]*/g, `transform.routerRoot=${ROOT}`);
    const upstream = http.request({ host: "127.0.0.1", port: target, method: req.method, path: url, headers: { ...req.headers, host: `localhost:${target}` } }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on("error", (e) => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(`proxy error: ${e.message}`);
    });
    req.pipe(upstream);
  })
  .listen(listen, () => console.log(`isolated preview http://localhost:${listen} -> metro :${target}, router root ${rootArg}`));
