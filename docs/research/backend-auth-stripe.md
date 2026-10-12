# Research: Hono on Vercel + Better Auth (Google, bearer, Chrome extension) + Drizzle/Neon + Stripe Checkout/Tax

Date: 2026-10-11. Primary sources only: npm registry, GitHub source at the release tag, and official docs.
Better Auth source was read at tag `v1.7.7`. stripe-node was read at tag `v23.0.0`.
**Verified by running code.** Two spikes ran Better Auth 1.7.7 + drizzle `pglite` + Hono 4.13.13:
- `signInSocial` and the bearer behaviour.
- The full extension flow, start → callback → finish → OTT → `/me`, using a mocked Google token endpoint and a cookie jar. Every step passed.
The sample server below type-checks against these exact versions (`tsc --strict`).

## 0. Versions (npm `latest`, 2026-10-11)

| package | version | note |
|---|---|---|
| `better-auth` | **1.7.7** | peer `drizzle-orm ^0.45.2 \|\| >=1.0.0-rc.1 <2` |
| `@better-auth/drizzle-adapter` | 1.7.7 | already a dependency of `better-auth`. `better-auth/adapters/drizzle` re-exports it |
| `auth` (Better Auth CLI) | 1.7.7 | `npx auth@latest generate`. `@better-auth/cli` is stale (1.4.21) |
| `hono` | **4.13.13** | `hono/vercel` is **deprecated** ("will be removed in v5, use `@hono/vercel`") |
| `@hono/vercel` | 1.0.1 | not needed with zero-config |
| `drizzle-orm` / `drizzle-kit` | **0.45.4** / 0.31.11 | `rc` tag = 1.0.0-rc.4. Drizzle docs now show `@rc` installs. Stay on `latest` |
| `@neondatabase/serverless` | **1.2.0** | |
| `@electric-sql/pglite` | **0.5.8** | |
| `stripe` | **23.0.0** (2026-10-01) | pinned API version **`2026-09-30.endive`**. Node ≥ 20 |
| `vercel` (CLI) | 63.1.2 | |

---

## 1. Better Auth core

### Mount on Hono
Official (docs/content/docs/integrations/hono.mdx, https://better-auth.com/docs/integrations/hono):
```ts
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
// equivalent, also fine: app.on(["GET","POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
```
- `basePath` defaults to `"/api/auth"`. The Hono route must match it. With `new Hono().basePath("/api")`, mount at `"/auth/*"`.
- Register the route before any catch-all. CORS (`hono/cors`) is only needed for cross-origin calls made with cookies (see §3: the extension uses bearer from the service worker, so no CORS is needed).
- Env vars: `BETTER_AUTH_SECRET` (or `AUTH_SECRET`), `BETTER_AUTH_URL` (base URL). `BETTER_AUTH_SECRETS` (plural) supports rotation.
- Google redirect URI to register in Google Cloud: `https://<api-host>/api/auth/callback/google`.

### Drizzle adapter
```ts
import { drizzleAdapter } from "better-auth/adapters/drizzle"; // or "@better-auth/drizzle-adapter"
database: drizzleAdapter(db, { provider: "pg", schema }), // pass schema explicitly
```
- `DrizzleAdapterConfig`: `{ schema?, provider: "pg"|"mysql"|"sqlite", usePlural?, camelCase?, transaction? (default false), debugLogs? }`.
- **neon-http is safe.** The adapter only calls `db.transaction` on the MySQL paths, or when `transaction: true`. The pg `consumeOne`/`incrementOne` paths use `DELETE/UPDATE … RETURNING`. Source: packages/drizzle-adapter/src/drizzle-adapter.ts.
- Joins are optional and need relations: `advanced: { database: { joins: true } }`. 1.7 renamed this from `experimental.joins`.

### Core schema (exact output of `npx auth generate` for 1.7.7, provider pg, with `role` additionalField)
The generator now emits **snake_case column names**. Better Auth maps fields by the **property** name, so column names are free to differ.
```ts
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  role: text("role").default("user"), // from user.additionalFields
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [index("session_userId_idx").on(t.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()).notNull(),
}, (t) => [index("account_userId_idx").on(t.userId)]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

export const userRelations = relations(user, ({ many }) => ({ sessions: many(session), accounts: many(account) }));
export const sessionRelations = relations(session, ({ one }) => ({ user: one(user, { fields: [session.userId], references: [user.id] }) }));
export const accountRelations = relations(account, ({ one }) => ({ user: one(user, { fields: [account.userId], references: [user.id] }) }));
```
- Field source of truth: packages/core/src/db/get-tables.ts.
- The `verification` table is **required**. The default OAuth state strategy is `"database"` whenever a DB is configured (context/create-context.ts).
- The bearer and one-time-token plugins add **no tables**. OTT tokens live in `verification`.
- `rateLimit` is a table only if `rateLimit.storage === "database"`.

### trustedOrigins
```ts
trustedOrigins: ["chrome-extension://<EXT_ID>"], // wildcard "chrome-extension://*" is supported but discouraged (dev only)
```
Source: docs/content/docs/guides/browser-extension-guide.mdx.

---

## 2. Bearer plugin

Source: packages/better-auth/src/plugins/bearer/index.ts. Docs: https://better-auth.com/docs/plugins/bearer.

```ts
import { bearer } from "better-auth/plugins";
plugins: [bearer({ requireSignature: true })]
```
- **Before-hook.** It reads `Authorization: Bearer <t>` (the scheme is matched case-insensitively), turns it into the session cookie, and lets normal cookie auth run.
  - If `<t>` contains `.`, it is treated as the **signed cookie value** `"<sessionToken>.<base64 HMAC-SHA256>"`. It is URL-decoded if it contains `%`.
  - If `<t>` has no `.`, it is treated as the **raw `session.token`**. The plugin signs it server-side and accepts it, **unless `requireSignature: true`**, in which case it is ignored. Verified: a raw token with `requireSignature` returns `getSession → null`.
  - The HMAC is verified with the auth secret. An invalid HMAC is ignored silently, so the request is treated as anonymous.
- **After-hook.** On any response that sets a non-expired session cookie, it adds a `set-auth-token: <signed cookie value>` header and appends `set-auth-token` to `Access-Control-Expose-Headers`. The value is the **signed** form (`token.sig`), and the sig may contain `+/=`.
- It works for `auth.api.*` server calls too: the hook reads `context.headers`.
- **Recommendation:** use `requireSignature: true`. The client stores and sends only the signed `set-auth-token` value, so a leaked DB `session.token` alone is useless.
- Session lifetime: default `expiresIn` 7d, `updateAge` 1d. The token string stays the same when the session is refreshed.

---

## 3. Chrome-extension Google sign-in without third-party cookies

### What the official guide says
docs/content/docs/guides/browser-extension-guide.mdx (Plasmo):
- It uses `createAuthClient({ baseURL })` from `better-auth/react` directly inside the extension.
- It adds the backend to `manifest.host_permissions` and the extension origin to `trustedOrigins`.
- **It relies on cookies.** It does not cover social sign-in, `launchWebAuthFlow`, or bearer. It is cookie-dependent, so it does not meet the no-third-party-cookies requirement. Don't follow it for auth transport.

### Your plan works on 1.7.7 (verified end-to-end); OTT hardening is recommended
Findings from the source and the spike:
1. **Server-side `signInSocial` returns `{ url, redirect }` and sets a state cookie that you must forward.**
   - Code: packages/better-auth/src/api/routes/sign-in.ts and src/state.ts.
   - With the DB strategy, it writes a `verification` row (`auth-state:<state>`) **and** sets a signed cookie: `__Secure-better-auth.state=<state>.<sig>; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=Lax`.
   - The callback rejects the request if that cookie is missing, unless you set `account.skipStateCookieCheck` (don't).
   - So call it with **`returnHeaders: true`** and copy `headers.getSetCookie()` onto your 302. Pass `disableRedirect: true` so Better Auth does not set its own `Location`.
2. `SameSite=Lax` cookies are sent on the top-level GET redirect from Google back to `/api/auth/callback/google`. Every hop is a first-party top-level navigation in the `launchWebAuthFlow` window, so **third-party-cookie blocking does not apply**.
3. After the callback, Better Auth sets `__Secure-better-auth.session_token` and 302s to `callbackURL`. `/ext/auth/finish` therefore sees the session cookie.
4. ⚠️ `auth.api.signInSocial()` called **server-side does not validate `callbackURL`**. A spike passed `https://evil.com` and it was accepted. Over HTTP the same value returns 403 `INVALID_CALLBACK_URL`. So hard-code `callbackURL` and allowlist `redirect_uri` yourself.
5. **Hardening: don't put the session token in the redirect URL. Put a one-time token there instead.**
   - Use the `oneTimeToken` plugin (docs/content/docs/plugins/one-time-token.mdx).
   - `/ext/auth/finish` calls `auth.api.generateOneTimeToken({ headers })`: 32 chars, single use, 3 min default.
   - The extension `POST`s it to `/api/auth/one-time-token/verify`. That endpoint calls `setSessionCookie`, so the bearer after-hook returns **`set-auth-token`** (signed).
   - A replayed OTT returns 400 (verified).

```ts
// auth.ts
plugins: [bearer({ requireSignature: true }), oneTimeToken({ disableClientRequest: true, storeToken: "hashed" })],

// routes (verified flow)
const EXT_REDIRECT = `https://${process.env.EXTENSION_ID}.chromiumapp.org/`; // == chrome.identity.getRedirectURL()

app.get("/ext/auth/start", async (c) => {
  if (c.req.query("redirect_uri") !== EXT_REDIRECT) throw new HTTPException(400);
  const { headers, response } = await auth.api.signInSocial({
    body: {
      provider: "google",
      callbackURL: `${process.env.BETTER_AUTH_URL}/ext/auth/finish`,
      errorCallbackURL: `${process.env.BETTER_AUTH_URL}/ext/auth/finish`, // Better Auth appends ?error=...
      disableRedirect: true,
    },
    returnHeaders: true,
  });
  const res = c.redirect(response.url!, 302);
  for (const ck of headers.getSetCookie()) res.headers.append("set-cookie", ck); // REQUIRED (state cookie)
  return res;
});

app.get("/ext/auth/finish", async (c) => {
  const err = c.req.query("error");
  if (err) return c.redirect(`${EXT_REDIRECT}#error=${encodeURIComponent(err)}`);
  const { token } = await auth.api.generateOneTimeToken({ headers: c.req.raw.headers }); // 401 if no session
  return c.redirect(`${EXT_REDIRECT}#ott=${encodeURIComponent(token)}`);
});
```
Extension side (service worker; needs the `"identity"` permission and `host_permissions: ["https://<api-host>/*"]`):
```ts
const redirectUri = chrome.identity.getRedirectURL(); // https://<id>.chromiumapp.org/
const final = await chrome.identity.launchWebAuthFlow({
  url: `${API}/ext/auth/start?redirect_uri=${encodeURIComponent(redirectUri)}`, interactive: true,
});
const p = new URLSearchParams(new URL(final!).hash.slice(1));
if (p.get("error")) throw new Error(p.get("error")!);
const r = await fetch(`${API}/api/auth/one-time-token/verify`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: p.get("ott") }),
});
const bearerToken = r.headers.get("set-auth-token")!; // signed; store in chrome.storage.local
// then: fetch(`${API}/...`, { headers: { Authorization: `Bearer ${bearerToken}` } })
```
- Simpler variant (also works): have `finish` redirect with `#token=<session.session.token>` and keep `requireSignature: false`. You lose the protection described in §2.
- Call the API from the **service worker** or extension pages. Chrome treats content-script requests as cross-origin *even with host permissions* (https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).
- `launchWebAuthFlow` closes the window when the URL matches `https://<app-id>.chromiumapp.org/*` and returns that URL (https://developer.chrome.com/docs/extensions/reference/api/identity).
- Alternative, not spiked: the Google provider supports **ID-token sign-in**.
  - `POST /api/auth/sign-in/social { provider:"google", idToken:{ token } }` returns `{ token, user }` plus `set-auth-token`.
  - `google.clientId` may be an **array** to accept extra audiences.
  - It needs an implicit `id_token` flow to Google from `launchWebAuthFlow`. That avoids the server-side redirect dance, but you handle the nonce and Google client config yourself.
- Sign-out: `POST /api/auth/sign-out` with the `Authorization: Bearer` header revokes the session row.

---

## 4. Session in Hono middleware; additional fields

Official (integrations/hono.mdx), adapted. It works the same for cookies and bearer:
```ts
import { createMiddleware } from "hono/factory";
type Env = { Variables: {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
} };
export const requireUser = createMiddleware<Env>(async (c, next) => {
  const s = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!s) throw new HTTPException(401);
  c.set("user", s.user); c.set("session", s.session);
  await next();
});
```
Additional fields (docs/content/docs/concepts/database.mdx):
```ts
user: { additionalFields: {
  role: { type: ["user", "admin"], required: false, defaultValue: "user", input: false },
} },
```
- `input: false` makes the field **server-owned**. API input and `mapProfileToUser` cannot set it, but `defaultValue` still applies on OAuth sign-up. Promote users with your own DB write.
- `returned` (default true) controls whether the field appears in responses.
- `s.user.role` is typed through `$Infer`. Verified: a new user gets `role: "user"`.

---

## 5. Hono on Vercel + Neon

**Zero-config is the current recommendation** (https://vercel.com/docs/frameworks/backend/hono, updated 2026-08-10; https://hono.dev/docs/getting-started/vercel):
- Put `export default app` in one of `app|index|server.{ts,mts,js…}` or `src/app|index|server.*`.
- Routes become Vercel Functions on the **Node.js runtime with Fluid compute** by default.
- Run locally with `vc dev`.
- Don't use `hono/vercel` `handle` (deprecated). Don't use Hono `serveStatic` (ignored; use `public/`).

`vercel.json` (https://vercel.com/docs/functions/configuring-functions/region). The default region for new projects is `iad1`:
```json
{ "$schema": "https://openapi.vercel.sh/vercel.json", "regions": ["cdg1"] }
```
Neon + Drizzle (https://orm.drizzle.team/docs/pg/connect-neon):
```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
export const db = drizzle({ client: neon(process.env.DATABASE_URL!), schema });
// shorthand: drizzle(process.env.DATABASE_URL!, { schema })
```
- `neon-http` has no interactive transactions. Use `drizzle-orm/neon-serverless` with `Pool` (and `ws` on Node) if you need them. Better Auth doesn't need them (§1).
- Neon has no Paris region. The EU options are `aws-eu-central-1` (Frankfurt) and `aws-eu-west-2` (London) (https://neon.com/docs/introduction/regions). Pick one of them for `cdg1`.

PGlite for tests (https://orm.drizzle.team/docs/pg/connect-pglite):
```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
const client = new PGlite(); // in-memory
const db = drizzle({ client, schema });
// apply migrations: import { migrate } from "drizzle-orm/pglite/migrator"; await migrate(db, { migrationsFolder: "drizzle" });
```
- Better Auth + `drizzleAdapter(db, { provider: "pg", schema })` on PGlite runs fine (that is how the spikes ran).
- Inject `db` into a `createAuth(db)` factory so tests can swap it.
- For OAuth tests, stub `fetch` for `https://oauth2.googleapis.com/token` and return an `id_token`. Google's `getUserInfo` only `decodeJwt`s the code-flow id_token (core/src/social-providers/google.ts).

---

## 6. Stripe (stripe-node 23.0.0, API `2026-09-30.endive`)

Sources:
- https://github.com/stripe/stripe-node/blob/v23.0.0/src/apiVersion.ts and CHANGELOG.md
- https://docs.stripe.com/tax/checkout/page
- https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing?payment-ui=stripe-hosted
- https://docs.stripe.com/payments/checkout/localize-prices/manual-currency-prices
- https://docs.stripe.com/checkout/fulfillment
- https://docs.stripe.com/refunds#refund-events

v23 notes:
- `new Stripe(key)` uses the pinned `2026-09-30.endive`. Create the webhook endpoint with the same `api_version` so payloads match the types.
- ⚠️ `payment_method_types` was **removed** from `Checkout.SessionCreateParams`. Use `allowed_payment_method_types` or dynamic payment methods.
- `Stripe.constructEventWithoutVerification` was removed.
- `constructEvent(…, tolerance=0)` now really skips the tolerance check.

### Checkout Session (one-time, Stripe Tax)
```ts
const session = await stripe.checkout.sessions.create({
  mode: "payment",
  line_items: [{ price: PRICE_ID, quantity: 1 }],
  client_reference_id: user.id,
  customer_email: user.email,
  customer_creation: "always",              // tax docs example; stores address on Customer
  automatic_tax: { enabled: true },
  billing_address_collection: "required",   // digital goods: tax from billing address
  metadata: { userId: user.id },
  payment_intent_data: { metadata: { userId: user.id } }, // lands on the PaymentIntent (for refunds)
  success_url: `${PUBLIC_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${PUBLIC_URL}/billing/cancel`,
});
// return session.url to the extension → chrome.tabs.create({ url })
```
Stripe Tax prerequisites:
- Add tax **registrations** (Dashboard → Tax → Registrations, or `POST /v1/tax/registrations`). Tax is only collected where you are registered.
- Set a product tax code and a price `tax_behavior` (`exclusive` or `inclusive`).
- The docs point digital-goods sellers at **Managed Payments** (Stripe as merchant of record) as an alternative.

### Multi-currency: two options
- **A. Manual `currency_options` on the Price.** You control EUR exactly.
  ```ts
  await stripe.prices.create({
    product: PRODUCT_ID, currency: "usd", unit_amount: 1000, tax_behavior: "exclusive",
    currency_options: { eur: { unit_amount: 950, tax_behavior: "exclusive" } },
  });
  ```
  - Checkout picks the currency from the customer's location automatically.
  - With Stripe Tax, **every currency option must have a `tax_behavior`**, or Checkout falls back to the default currency.
  - Don't pass `currency` on the session if you want auto-localisation. Passing `currency: "eur"` forces EUR.
- **B. Adaptive Pricing.** Stripe *recommends* this over manual prices.
  - Enable it in the Dashboard (settings/adaptive-pricing) or per session with `adaptive_pricing: { enabled: true }`.
  - Stripe converts to 150+ local currencies, ML-picks the currency, and guarantees the FX rate for 24 h. The customer pays a conversion fee.
  - Tax is calculated on the **integration-currency** price, then converted.
  - It is **skipped for currencies already in the Price's `currency_options`**. So A+B combined means EUR uses your fixed price and other currencies are converted.
  - The completed session carries `presentment_details { presentment_amount, presentment_currency }`.
  - It requires the price currency to be one of your settlement currencies.
- Test localisation with a customer email like `test+location_FR@example.com`.

### Webhook in Hono (Node runtime)
```ts
app.post("/stripe/webhook", async (c) => {
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.text("missing signature", 400);
  const raw = await c.req.text(); // raw body; do NOT parse JSON first
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch { return c.text("bad signature", 400); }
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      if (s.payment_status !== "paid") break;   // async methods complete as "unpaid" first
      // grant to s.client_reference_id; persist s.id, s.payment_intent, amount_total, currency, total_details.amount_tax
      break;
    }
    case "charge.refunded": {                    // full AND partial refunds
      const ch = event.data.object;              // ch.refunded === true → fully refunded; ch.amount_refunded
      const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
      // map: look up your purchase row by stored payment_intent id, or:
      const { data } = await stripe.checkout.sessions.list({ payment_intent: pi!, limit: 1 });
      // data[0].client_reference_id → user
      break;
    }
  }
  return c.json({ received: true });
});
```
- **Crypto provider.** On Node, `constructEvent` (sync) or `constructEventAsync` both work and default to `NodeCryptoProvider`.
  - The `worker`/`workerd`/`deno`/`bun`/`browser` export conditions load `stripe.esm.worker.js`, which uses SubtleCrypto.
  - `Stripe.createSubtleCryptoProvider()` still exists in v23 but is **not needed** on Vercel Node.
- **Paid events.**
  - `checkout.session.completed` plus `checkout.session.async_payment_succeeded`, gated on `payment_status`. Optionally handle `…async_payment_failed`.
  - Make fulfillment idempotent on `session.id`.
  - With a `success_url`, Checkout waits up to 10 s for the webhook before redirecting.
- **Refunds.**
  - `charge.refunded` fires for full and partial refunds.
  - Stripe recommends listening at least to `refund.created`. Also `refund.updated` and `refund.failed`.
  - `Refund` and `Charge` both carry `payment_intent`. Map payment_intent → session → `client_reference_id`, either from your stored row or with `checkout.sessions.list({ payment_intent })` (a supported list filter).
  - Also consider `charge.dispute.created` for revocation.
- Testing: use `stripe.webhooks.generateTestHeaderString({ payload, secret })`, then `constructEvent` (stripe-node README).
