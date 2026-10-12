// Local dev: `pnpm dev`. PGlite file database (migrations applied) unless DATABASE_URL is set.
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

import { serve } from "@hono/node-server"

import { createNeonDatabase } from "./adapters/db/neon"
import { createPgliteDatabase } from "./adapters/db/pglite"
import { parseEnv } from "./env"
import { createBackend } from "./main"

const env = parseEnv(process.env, false)

let db
if (env.DATABASE_URL) {
  db = createNeonDatabase(env.DATABASE_URL)
} else {
  mkdirSync(dirname(env.PGLITE_DIR), { recursive: true })
  db = (await createPgliteDatabase(env.PGLITE_DIR)).db
}

const { app } = createBackend(env, db)
serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  console.log(`Cash Boost backend on http://localhost:${port} (${env.DATABASE_URL ? "Neon" : `PGlite ${env.PGLITE_DIR}`})`)
  if (env.SUPERX_TEST_AUTH) console.log(`Test mode: sign-in without Google · admin at http://localhost:${port}/admin/test-login`)
})
