import type { Context } from "hono"
import type { z } from "zod"

import type { Auth } from "../adapters/auth"
import { AppError, type AccessService, type AdminService, type BillingService, type ClassifyService, type ConfigService } from "../application"

export interface AppDeps {
  auth: Auth
  access: AccessService
  classify: ClassifyService
  billing: BillingService
  config: ConfigService
  admin: AdminService
  /** Public base URL of the backend (BETTER_AUTH_URL). */
  baseUrl: string
  secret: string
  extensionIds: string[]
  /** Test sign-in without Google (local dev only). */
  testAuth?: boolean
}

export type AppEnv = {
  Variables: {
    userId: string
    admin: { id: string; email: string }
  }
}

/** Validates a JSON body; the error lists field paths only, never the submitted values. */
export async function jsonBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  const parsed = schema.safeParse(await c.req.json().catch(() => undefined))
  if (!parsed.success) {
    const paths = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "body"))]
    throw new AppError("invalid_request", 400, `invalid ${paths.join(", ")}`)
  }
  return parsed.data
}
