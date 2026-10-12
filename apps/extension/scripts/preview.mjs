#!/usr/bin/env node
// Serves the built side panel as a plain web page with a fake chrome.* (preview/chrome-stub.js), to iterate on the UI
// in any browser tab. Rebuild with `pnpm build`, then reload. Scenarios: /sidepanel.html?state=panel|empty|signin|…
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const build = join(root, "build/chrome-mv3-prod")
const stub = join(root, "preview/chrome-stub.js")
const port = Number(process.env.PORT ?? 4179)

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".json": "application/json" }

createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname
  try {
    if (path === "/__preview/chrome-stub.js") return send(res, ".js", await readFile(stub))
    if (path === "/" || path === "/sidepanel.html") {
      const html = await readFile(join(build, "sidepanel.html"), "utf8")
      return send(res, ".html", html.replace("<head>", '<head><script src="/__preview/chrome-stub.js"></script>'))
    }
    const file = normalize(join(build, path))
    if (!file.startsWith(build)) throw new Error("outside build")
    send(res, extname(file), await readFile(file))
  } catch {
    res.writeHead(404).end("not found")
  }
}).listen(port, () => console.log(`Side panel preview: http://localhost:${port}/sidepanel.html`))

function send(res, ext, body) {
  res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "no-store" }).end(body)
}
