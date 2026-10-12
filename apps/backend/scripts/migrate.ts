// `pnpm db:migrate`: applies drizzle/ to DATABASE_URL (Neon), or to the local PGlite file database.
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { migrate } from "drizzle-orm/neon-http/migrator"

import { MIGRATIONS_FOLDER } from "../src/adapters/db/database"
import { createPgliteDatabase } from "../src/adapters/db/pglite"

const url = process.env.DATABASE_URL
if (url) {
  await migrate(drizzle({ client: neon(url) }), { migrationsFolder: MIGRATIONS_FOLDER })
  console.log("Neon: migrations applied")
} else {
  const dir = process.env.PGLITE_DIR ?? ".data/pglite"
  mkdirSync(dirname(dir), { recursive: true })
  const { close } = await createPgliteDatabase(dir)
  await close()
  console.log(`PGlite ${dir}: migrations applied`)
}
