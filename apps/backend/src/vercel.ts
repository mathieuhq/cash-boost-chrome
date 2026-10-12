// Vercel Function entry, bundled by scripts/build.ts into .vercel/output (Build Output API).
import { getRequestListener } from "@hono/node-server"

import { createNeonDatabase } from "./adapters/db/neon"
import { parseEnv } from "./env"
import { createBackend } from "./main"

const env = parseEnv(process.env, true)
const { app } = createBackend(env, createNeonDatabase(env.DATABASE_URL))

export default getRequestListener(app.fetch)
