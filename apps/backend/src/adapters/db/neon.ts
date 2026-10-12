import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"

import type { Database } from "./database"
import * as schema from "./schema"

/** Production: Neon over HTTP (no interactive transactions; none are used). */
export function createNeonDatabase(url: string): Database {
  return drizzle({ client: neon(url), schema }) as unknown as Database
}
