// `pnpm build`: bundles src/vercel.ts (with @super-x/contracts, which ships TypeScript source) into a
// Vercel Build Output API v3 directory. Vercel deploys .vercel/output as is.
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { build } from "esbuild"

const root = fileURLToPath(new URL("..", import.meta.url))
const output = `${root}.vercel/output`
const fn = `${output}/functions/index.func`

rmSync(output, { recursive: true, force: true })
mkdirSync(fn, { recursive: true })

await build({
  entryPoints: [`${root}src/vercel.ts`],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  minify: false,
  sourcemap: true,
  legalComments: "none",
  // CommonJS dependencies (stripe) call require() inside the ESM bundle.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: "info",
})

writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify(
    {
      runtime: "nodejs24.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: true,
      supportsResponseStreaming: true,
      regions: ["cdg1"],
      maxDuration: 60,
    },
    null,
    2
  )
)
writeFileSync(`${fn}/package.json`, JSON.stringify({ type: "module" }))
writeFileSync(
  `${output}/config.json`,
  JSON.stringify({ version: 3, routes: [{ handle: "filesystem" }, { src: "/(.*)", dest: "/index" }] }, null, 2)
)
console.log(`Build output: ${output}`)
