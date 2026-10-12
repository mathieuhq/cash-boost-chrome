// Types shared by the extension and the backend (ADR 0001). Validated on both sides with zod.
import * as z from "zod"

/** Every authenticated request carries the browser's id; a mismatch means another browser took over. */
export const BROWSER_HEADER = "x-super-x-browser"

export const EntitlementKind = z.enum(["student", "trial", "paid", "none"])
export type EntitlementKind = z.infer<typeof EntitlementKind>

export const Entitlement = z.object({
  kind: EntitlementKind,
  /** Epoch ms, only for `trial` (also kept once expired, so the panel can say when it ended). */
  trialEndsAt: z.number().optional(),
  /** False once this Google account (or X account) already used its Trial. */
  trialAvailable: z.boolean(),
})
export type Entitlement = z.infer<typeof Entitlement>

export const Account = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  image: z.string().nullish(),
  role: z.enum(["user", "admin"]),
})
export type Account = z.infer<typeof Account>

export const MeResponse = z.object({
  account: Account,
  entitlement: Entitlement,
  /** Growth Boost purchase email locked to this Account (matched by Google email or entered), or null. */
  studentEmail: z.string().nullable(),
  checkedAt: z.number(),
})
export type MeResponse = z.infer<typeof MeResponse>

/**
 * Extension sign-in: `chrome.identity.launchWebAuthFlow` on `/ext/auth/start` ends on
 * `https://<id>.chromiumapp.org/#code=<one-time code>`; the code is exchanged once for the bearer token.
 */
export const AuthExchangeRequest = z.object({ code: z.string().min(1), browserId: z.uuid() })
export type AuthExchangeRequest = z.infer<typeof AuthExchangeRequest>

/** `token` is the signed session token: send it as `Authorization: Bearer <token>`. */
export const AuthExchangeResponse = z.object({ token: z.string() })
export type AuthExchangeResponse = z.infer<typeof AuthExchangeResponse>

export const StartTrialRequest = z.object({ xUserId: z.string().regex(/^\d+$/) })
export type StartTrialRequest = z.infer<typeof StartTrialRequest>

export const CheckoutResponse = z.object({ url: z.string().url() })
export type CheckoutResponse = z.infer<typeof CheckoutResponse>

/** "Lier mon achat Growth Boost", step 1: the email the course was bought with. A code is emailed to it. */
export const StudentLinkRequest = z.object({ email: z.email().max(254) })
export type StudentLinkRequest = z.infer<typeof StudentLinkRequest>

export const StudentCodeSent = z.object({ email: z.string(), expiresAt: z.number() })
export type StudentCodeSent = z.infer<typeof StudentCodeSent>

/** Step 2: the 6-digit code received by email. Answers a MeResponse. */
export const StudentVerifyRequest = z.object({ code: z.string().regex(/^\d{6}$/) })
export type StudentVerifyRequest = z.infer<typeof StudentVerifyRequest>

export const MAX_CLASSIFY_BATCH = 25

export const ClassifyRequest = z.object({
  keyword: z.string().min(1).max(100),
  comments: z
    .array(z.object({ id: z.string(), text: z.string().max(1_000) }))
    .min(1)
    .max(MAX_CLASSIFY_BATCH),
})
export type ClassifyRequest = z.infer<typeof ClassifyRequest>

export const ClassifyResponse = z.object({
  results: z.array(z.object({ id: z.string(), probability: z.number().min(0).max(1) })),
  remainingToday: z.number(),
})
export type ClassifyResponse = z.infer<typeof ClassifyResponse>

/** Markers of the XChat UI (open shadow root under `root`), fixed here when X changes them. */
export const XChatSelectors = z.object({
  root: z.string(),
  header: z.string(),
  composer: z.string(),
  send: z.string(),
  /** One row per message, whoever wrote it: the link is looked for in the last ones. */
  message: z.string(),
  /** A message row X confirmed as delivered. */
  sent: z.string(),
  /** Path XChat redirects to while it waits for the user's passcode. */
  lockedPath: z.string(),
})
export type XChatSelectors = z.infer<typeof XChatSelectors>

export const DEFAULT_XCHAT_SELECTORS: XChatSelectors = {
  root: '[data-testid="xchatEmbedRoute"]',
  header: '[data-testid="dm-conversation-username"]',
  composer: '[data-testid="dm-composer-textarea"]',
  send: '[data-testid="dm-composer-send-button"]',
  message: '[data-testid^="message-"]:not([data-testid^="message-text-"])',
  sent: '[data-send-status="sent"]',
  lockedPath: "/i/chat/pin",
}

const Limits = z.object({ dm: z.number().int().min(0), like: z.number().int().min(0), reply: z.number().int().min(0) })

/** Served by the backend so X changes and thresholds can be fixed without republishing. Versioned. */
export const RemoteConfig = z.object({
  version: z.number().int(),
  thresholds: z.object({ accept: z.number().min(0).max(1), review: z.number().min(0).max(1) }),
  limits: z.object({ free: Limits, premium: Limits }),
  pacing: z.object({
    actionDelaySeconds: z.tuple([z.number().int().min(30), z.number().int()]),
    tickMinutes: z.tuple([z.number().int().min(1), z.number().int()]),
  }),
  x: z.object({
    /** GraphQL operation name → queryId. Missing ones are discovered from x.com's bundle. */
    queryIds: z.record(z.string(), z.string()),
    /** GraphQL `features` objects per operation; empty means the adapter's defaults. */
    features: z.record(z.string(), z.record(z.string(), z.boolean())),
    /**
     * `xchat_ui`: the XChat page in a dedicated tab, which also reads the last DMs to avoid sending twice.
     * `api`: legacy DM endpoint, blind. `public_reply`: fallback (a), the link goes in the public reply.
     */
    dmMode: z.enum(["xchat_ui", "api", "public_reply"]),
    xchat: XChatSelectors.default(DEFAULT_XCHAT_SELECTORS),
  }),
  /** Global kill switch: when true every extension stops its Campaigns. */
  killSwitch: z.boolean(),
})
export type RemoteConfig = z.infer<typeof RemoteConfig>

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
  version: 0,
  thresholds: { accept: 0.8, review: 0.4 },
  limits: { free: { dm: 20, like: 30, reply: 100 }, premium: { dm: 60, like: 30, reply: 100 } },
  pacing: { actionDelaySeconds: [30, 120], tickMinutes: [5, 15] },
  x: { queryIds: {}, features: {}, dmMode: "xchat_ui", xchat: DEFAULT_XCHAT_SELECTORS },
  killSwitch: false,
}

/** X error codes reported without any content, counted per RemoteConfig version. */
export const ErrorReport = z.object({
  configVersion: z.number().int(),
  extensionVersion: z.string(),
  codes: z.array(z.object({ code: z.string().max(40), count: z.number().int().min(1) })).max(50),
})
export type ErrorReport = z.infer<typeof ErrorReport>

export const ApiErrorCode = z.enum([
  "unauthorized",
  "browser_replaced",
  "browser_change_limit",
  "no_entitlement",
  "trial_used",
  "classification_cap",
  "invalid_request",
  "student_not_found",
  "student_email_taken",
  "student_already_linked",
  "student_link_limit",
  "student_code_invalid",
  "upstream_unavailable",
  "forbidden",
])
export type ApiErrorCode = z.infer<typeof ApiErrorCode>

export const ApiError = z.object({ error: ApiErrorCode, message: z.string().optional() })
export type ApiError = z.infer<typeof ApiError>
