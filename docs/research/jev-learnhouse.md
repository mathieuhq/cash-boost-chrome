# Research: OpenRouter Jev (Decisions API) + LearnHouse server-side auth/groups

Date: 2026-10-11. Primary sources only. LearnHouse source read at commit
`45cf5d4f78cf537064070dc8e315a64990d14966` (main, 2026-10-11) of github.com/learnhouse/learnhouse.

---

## Part 1 — OpenRouter Decisions API + `typesafe/jev-1.13`

The "Decisions API" is real. It is an **alpha** endpoint, and it is separate from chat completions.

Sources:
- Hub: https://openrouter.ai/docs/guides/community/jev
- Tutorial: https://openrouter.ai/docs/guides/community/jev-tutorial
- OpenAPI ref: https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request
- Live endpoint metadata: https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints (fetched 2026-10-11)
- TypeSafe (upstream) docs: https://docs.typesafe.ai/primitives/noul, https://docs.typesafe.ai/confidence, https://docs.typesafe.ai/models, https://docs.typesafe.ai/model-jaggedness/jev-1.13

### Endpoint / auth
- `POST https://openrouter.ai/api/alpha/decisions` (OpenAPI tag `alpha.decisions`, operationId `createApiAlphaDecisions`).
- Headers: `Authorization: Bearer $OPENROUTER_API_KEY` (a normal `sk-or-...` key) and `Content-Type: application/json`.
- No TypeSafe account is needed. Billing goes to the OpenRouter account. The docs say to keep the key server-side.
- Alternative surface: `POST https://openrouter.ai/api/v1/systemone` is meant for the TypeSafe SDK (`baseURL: 'https://openrouter.ai/api'`). Not needed here.
- OpenRouter SDKs (TS/Python/Go) wrap it: `/docs/client-sdks/{typescript,python,go}/sdks/decisions/README`.

### Request body (`DecisionsRequest`)
Required fields: `model`, `state`, `questions`.
```jsonc
{
  "model": "typesafe/jev-1.13",            // string
  "state": "...",                          // string | object | array: content to evaluate
  "questions": {                           // map: your id -> question (ids are NOT sent to the model)
    "<id>": { "type": "noul" | "choice" | "score", "instructions": ..., "criteria": ... }
  },
  "provider": { ... },                     // optional ProviderPreferences
  "session_id": "...",                     // optional, <=256 chars, observability only
  "trace": { "trace_id": "...", ... },     // optional
  "user": "..."                            // optional, <=256 chars
}
```
A yes/no question is the **Noul** primitive (`DecisionsNoulQuestion`):
- `type`: `"noul"` (required)
- `instructions`: string | object | array (required). This is the yes/no question, or a statement to judge.
- `criteria`: optional `{ "true": string|object|array, "false": string|object|array }`. If present, both keys are required.

### Response (`DecisionsResponse`)
Required fields: `model`, `answers`, `usage`.
```json
{
  "id": "gen-dec-1790015143-AIaTutprXsJ5EwohRSjb",
  "model": "typesafe/jev-1.13-20260917",
  "provider": "TypeSafe",
  "answers": { "is_bug": { "type": "noul", "noul": 0.96 } },
  "usage": { "input_tokens": 476, "output_tokens": 70, "cost": 0.000019992 }
}
```
- **The probability is at `answers.<id>.noul`.** It is a double in [0,1] and means P(yes).
- A Noul answer has no `confidence` field (only Choice and Score answers have one). TypeSafe suggests `|2p-1|` if a confidence-style number is needed (https://docs.typesafe.ai/confidence).
- `usage.cost` is the call's cost in USD.
- Errors return `{ "error": { "code": <int>, "message": "..." } }` with status 400, 401, 402 (insufficient credits), 403, 404, 413, 429, 500, 502, 503, 524 (edge timeout) or 529 (provider overloaded).

### Proposed call for our use case (shape only, from the schema above)
```bash
curl https://openrouter.ai/api/alpha/decisions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "model": "typesafe/jev-1.13",
    "state": { "lead_magnet_keyword": "<keyword>", "comment": "<comment text>" },
    "questions": {
      "wants_lead_magnet": {
        "type": "noul",
        "instructions": "Does `comment` ask to receive the lead magnet identified by `lead_magnet_keyword`?",
        "criteria": {
          "true": "The commenter requests / asks to be sent the resource (e.g. writes the keyword as a request, \"send it\", \"I want it\").",
          "false": "The comment does not request the resource (other topic, generic praise, question about something else)."
        }
      }
    }
  }'
# p = response.answers.wants_lead_magnet.noul
```
Several Nouls (for example `mentions_keyword` and `is_request`) can go in one request. They are evaluated in parallel and do not see each other.

### Calibration / thresholds
- TypeSafe says Jev is trained with "RLCD" (reinforcement learning for calibrated decisions). Its stated goal is that outcomes given p=0.8 happen about 80% of the time (https://docs.typesafe.ai/introduction/machine-learning-primer). This is the vendor's claim. No independent calibration numbers were found.
- The docs recommend thresholding `noul` in your own code. Use 0.5 when both kinds of error cost the same. Raise the threshold when a false yes is costly. Send a middle band (for example 0.2–0.8) to a human. Tune these values on labeled data.
- Known weak spots from the jev-1.13 jaggedness page:
  - It reads instructions literally.
  - It is weak at counting, math and dates.
  - **Adversarial content in `state` can move the answer.** Comments are user-controlled, so injection is a real risk.
- Language: "English is the primary training language… Other languages… are handled but not equally well; test on your own content" (https://docs.typesafe.ai/models). **French comments need their own evaluation.**

### Pricing / limits / pinning
- Price: $0.042 per 1M **input** tokens. Output tokens are free. Live endpoint data shows `pricing.prompt = "0.000000042"`, `completion = "0"`.
- Context: OpenRouter allows 32,000 prompt tokens (`max_prompt_tokens: 32000`, `context_length: 64000`). TypeSafe says 64k total covers `state` plus all questions, and 32k covers `state` plus the longest question.
- Rate limits (TypeSafe upstream): 100K tokens/s and 80 req/s. TypeSafe notes these "are adjusting dynamically… can change without notice." OpenRouter documents no Jev-specific rate limit; its platform caps apply only to `:free` variants and DDoS protection (https://openrouter.ai/docs/api/reference/limits). A 429 can come from OpenRouter or upstream; honor `Retry-After`.
- Model IDs:
  - `typesafe/jev-1.13` pins the 1.13 release. The response `model` reports the dated snapshot, e.g. `typesafe/jev-1.13-20260917`.
  - `~typesafe/jev-latest` is a moving alias.
  - The tutorial says to pin `typesafe/jev-1.13` when thresholds are tuned against one version.
  - **Not documented:** whether the dated snapshot ID can be sent in the request.
- `typesafe/jev-1.13` does not appear in `GET /api/v1/models` (that list returns only `typesafe/jev-router`). It does resolve at `/api/v1/models/typesafe/jev-1.13/endpoints`, with modality `text->decisions`.
- Do not confuse it with `typesafe/jev-router`. That is a chat-completions *router* that uses Jev to pick another model. It does not return probabilities.

---

## Part 2 — LearnHouse (self-hosted at https://learn.example.com)

Live probe on 2026-10-11 (unauthenticated GETs):
- `GET /api/v1/instance/info` returned `{"tenancy":"single","default_org_slug":"my-school","frontend_domain":"learn.example.com","top_domain":"learn.example.com","mode":"oss","multi_org_enabled":false}`
- `GET /api/v1/admin/x/users/by-email/a%40b.c` returned 403 `{"detail":"This endpoint requires API token authentication"}`. So the Admin API router is deployed.
- `GET /api/v1/users/profile` (no token) returned 200 `{"id":0,"user_uuid":"user_anonymous","username":"anonymous"}`.
- `/api/v1/docs` and `/openapi.json` return 404 (Swagger is disabled in prod).
- The API is on the same host under `/api/v1`. nginx sends `/api/v1` to the backend and `/api/auth` to Next.js (`docker/nginx.conf`).

### (a) API tokens (`lh_`) and the Admin API
**Format.** Tokens look like `lh_` + `secrets.token_urlsafe(32)`. The first 12 chars are stored as `token_prefix`, plus a SHA-256 hash. The full secret is returned **once**, at creation (`apps/api/src/services/api_tokens/api_tokens.py:35-53`).

**How to create one**
- UI: Dashboard → Developers → API (`/dash/developers/api`). The old `/dash/org/settings/api` redirects there (`apps/web/app/orgs/[orgslug]/dash/org/settings/[subpage]/page.tsx`).
- HTTP, with a logged-in admin user JWT (an API token cannot be used here): `POST /api/v1/orgs/{org_id}/api-tokens` (`apps/api/src/routers/api_tokens.py`, mounted with prefix `/orgs` in `src/router.py`).
  - Body (`APITokenCreate`): `{ "name": str, "description"?: str, "rights"?: Rights|dict, "expires_at"?: str }`.
  - Response (`APITokenCreatedResponse`): `{ token, token_uuid, name, description, token_prefix, org_id, rights, created_by_user_id, creation_date, expires_at }`.
  - Other routes:
    - `GET /orgs/{org_id}/api-tokens`
    - `GET|PUT|DELETE /orgs/{org_id}/api-tokens/{token_uuid}`
    - `POST /orgs/{org_id}/api-tokens/{token_uuid}/regenerate`
  - Requires the user's role to have `roles.action_create`.
- Rights:
  - If `rights` is given, it must contain these buckets: `courses, activities, coursechapters, folders, media, certifications, usergroups, payments, search`. Each bucket is an object like `{action_create, action_read, action_update, action_delete}`.
  - A token cannot get a right its creator lacks.
  - For our use, grant at least **`users.action_read`** (the UI calls it "Users (Admin API)") and **`usergroups.action_read`**.
  - A missing bucket or flag means 403: `"API token does not have 'read' permission for users"` (`services/admin/admin.py:_require_token_right`).
- Plan gate: the docs say "Pro plan". In code, both `require_plan("pro", ...)` and the Admin API's `_resolve_org_slug` call `plan_meets_requirement`, which returns True in **`oss` mode** for anything except `enterprise` (`security/features_utils/plans.py:336-345`). This instance runs `mode: oss`, so **no plan blocks it**.

**Header.** Send `Authorization: Bearer lh_...` (the match is case-insensitive). `get_current_user` routes `Bearer lh_` to API-token validation; other Bearer values are treated as a JWT (`apps/api/src/security/auth.py:543-600`). If the URL contains an org_id or org_slug, it must match the token's org.

**Admin API** (`apps/api/src/routers/admin.py`). Prefix: `/api/v1/admin/{org_slug}/...`. It accepts API tokens **only** (anything else gets 403). For this school, `org_slug = my-school`.

Relevant endpoints:

| Method + path | Right | Response |
|---|---|---|
| `GET /api/v1/admin/{org_slug}/users/by-email/{email}` (URL-encode email) | users.read | `OrgMemberUserRead` (below). 404 `"User not found in this organization"`. **Rate limit 60/min per token** (429 + Retry-After) |
| `GET /api/v1/admin/{org_slug}/users/{user_id}/groups` | usergroups.read | `[{ "usergroup": UserGroupRead, "added_at": str }]`. 404 if the user is not in the org |
| `GET /api/v1/admin/{org_slug}/usergroups/{usergroup_uuid}/members?page=1&limit=25` (limit ≤100) | usergroups.read | `[{ "user": OrgMemberUserRead, "added_at": str }]` |
| `GET /api/v1/admin/{org_slug}/courses/{course_uuid}/access/{user_id}` | courses.read | `{has_access, is_enrolled, is_public, is_published}`. **Caveat:** it only checks `course.public` or enrollment (TrailRun). It **ignores usergroup links** (`services/admin/admin.py:409-440`). Don't use it for group gating |
| `GET /api/v1/admin/{org_slug}/enrollments/{user_id}` | — | enrollment/progress summary |

Other Admin API routes: provision user, magic link, issue user JWT (`POST /{org_slug}/auth/token`), enroll/unenroll, progress, certificates, usergroup create/delete/add-member/remove-member/link-course, export, anonymize.

`OrgMemberUserRead` fields: `id, user_uuid, username, first_name, last_name, email, email_verified, avatar_image, bio, details, profile, extra_metadata (filtered to org signup fields), last_login_at, signup_method`.

`UserGroupRead` fields: `id, org_id, usergroup_uuid, name, description, creation_date, update_date`.

The email lookup is an exact SQL equality (`User.email == email`). It is **not** case-insensitive, so normalize the email before calling.

### (b) Is user X (by email) in a usergroup linked to private course C?
Group-based course access works like this (`apps/api/src/security/rbac/rbac.py:55-110`):
- If any `UserGroupResource` rows link the course (`resource_uuid = course_uuid`), the user must be in **at least one** of those groups. If none of the groups qualifies and a group is tied to a paid offer, the API returns 402.
- If no group is linked, any authenticated user can access the course.

Recommended flow with one `lh_` token (rights: users.read + usergroups.read):
1. `GET /api/v1/admin/my-school/users/by-email/{urlencoded email}` → `id` (404 means not a member of the org).
2. `GET /api/v1/admin/my-school/users/{id}/groups` → set of `usergroup.usergroup_uuid` / `usergroup.id`.
3. Compare against the target group UUID (config), or against the course's linked groups:
   `GET /api/v1/usergroups/resource/{course_uuid}` → `list[UserGroupRead]`.

Endpoints on `/api/v1/usergroups` (`apps/api/src/routers/usergroups.py`). This router **does accept `lh_` tokens** (`require_authenticated_user_or_api_token`). The rights checked are the token's `usergroups` rights plus the org boundary.
- `GET /api/v1/usergroups/org/{org_id}` → `list[UserGroupRead]` (needs the numeric org_id, which is returned as `org_id` when the token is created).
- `GET /api/v1/usergroups/{usergroup_id}` → `UserGroupRead`.
- `GET /api/v1/usergroups/{usergroup_id}/users` → `list[UserReadPublic]`. This view has **no email**, so use the Admin members endpoint instead.
- `GET /api/v1/usergroups/{usergroup_id}/resources` → `list[str]` (resource UUIDs, e.g. course_uuid).
- `GET /api/v1/usergroups/resource/{resource_uuid}` → `list[UserGroupRead]`.

Note: `/api/v1/users/*` and `/api/v1/orgs/*` **reject API tokens** (`get_non_api_token_user` in `src/router.py`). The docs example `curl /api/v1/users/profile -H "Authorization: Bearer lh_..."` in `docs/content/developers/api/authentication.mdx` is wrong against current code.

### (c) Validating a LearnHouse browser session from the extension
How the session is stored. There is **no NextAuth**: `AuthContext.tsx` only imitates NextAuth's session shape.
- Access token: a JWT in **cookie `LH_access`**. It is `httpOnly`, `SameSite=Lax`, `Secure` on https, `path=/`, and lasts 8 h.
  - Single tenancy (this instance) makes it a host-only cookie on `learn.example.com` (`apps/web/services/auth/cookies.ts`).
  - The backend sets the same names (`apps/api/src/security/auth.py:83`, `routers/auth.py:191-213`).
- Refresh token: cookie `LH_refresh`. It is httpOnly and lasts 30 days. **Never send it to our backend.**
- In page JS, the access token lives only in React memory (`session.data.tokens.access_token`). It is **not in localStorage**; localStorage holds just `lh_xtab_refresh_at`, a timestamp.
- Because the cookie is httpOnly, `document.cookie` in a content script cannot read it. Use the `chrome.cookies.get({ url: "https://learn.example.com", name: "LH_access" })` API, which needs the `cookies` permission plus a host permission for that origin.
- The docs mention `access_token_cookie` (`docs/content/developers/api/*.mdx`). That name is **stale**; the code uses `LH_access`.

JWT details:
- HS256, signed with the server's secret, so our backend cannot verify it locally.
- `sub` = the user's **email**. `exp` and `sub` are required.
- A token is rejected when:
  - its `purpose` is present and not `"session"`;
  - its `type` is present and not `"access"` (this blocks refresh tokens);
  - it was issued before a password change or a logout.

Endpoint that returns the current user:
- `GET https://learn.example.com/api/v1/users/profile` with `Authorization: Bearer <LH_access JWT>`, or with `Cookie: LH_access=<jwt>`. The header takes precedence over the cookie.
  - Valid → 200 `PublicUser`, which is `UserRead`: `username, first_name, last_name, email, avatar_image, bio, details, profile, extra_metadata, id, user_uuid, email_verified, last_login_at, signup_method, is_superadmin`.
  - **Missing, invalid or expired token → still 200**, returning `{"id":0,"user_uuid":"user_anonymous","username":"anonymous"}` (confirmed live). **Treat `id == 0` / `user_uuid == "user_anonymous"` as unauthenticated.** Do not rely on a 401.
  - A JWT whose user no longer exists, or that has been revoked, raises 401.
- `GET /api/v1/users/session` with the same auth → `{ user: UserRead, roles: [{ role: RoleRead, org: OrganizationRead }] }`. It is cached in Redis for 10 min per user. The web app itself uses this endpoint (`AuthContext.tsx:307`) and treats 401/403 as signed out.

Then chain into (b): take `email` (or `id`) from `/users/profile`, check group membership via the Admin API with the server-held `lh_` token, and never use the user's JWT for that.

Expiry: `LH_access` lasts 8 h. The web app refreshes it through Next.js `GET /api/auth/refresh` (cookie-based), which rewrites `LH_access`. An extension reading the cookie gets whatever the tab last refreshed. If the user hasn't visited the site within 8 h, expect the anonymous response.

### Not found / unverified
- No Admin API endpoint for "list usergroups of org" exists under `/admin/...`. Use `/api/v1/usergroups/org/{org_id}`.
- The exact version deployed on learn.example.com is unknown. The probes show the `/admin` router and the `oss` mode exist there, but field-level parity with main was not verified.
