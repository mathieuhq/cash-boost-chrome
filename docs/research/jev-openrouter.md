# Research: OpenRouter Jev (Decisions API)

Date: 2026-10-11. Primary sources only.

## OpenRouter Decisions API + `typesafe/jev-1.13`

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
- No TypeSafe account is needed. Billing goes to the OpenRouter account. The docs say to keep the key server-side. Cash Boost has no server: each user's own key stays in their extension (ADR 0010).
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

