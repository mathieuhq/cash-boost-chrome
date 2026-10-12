import type { ApiErrorCode } from "@super-x/contracts"

/** A use case refusal, mapped 1:1 to an ApiError response. */
export class AppError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 502,
    message?: string
  ) {
    super(message ?? code)
    this.name = "AppError"
  }
}
