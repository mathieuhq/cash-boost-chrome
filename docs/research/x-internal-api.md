# X internal web API (x.com/i/api) for a MAIN-world content script

Research date: 2026-10-11. Scope: same-origin `fetch()` from a MAIN-world script on an `x.com` tab, reusing the user's cookies, on the user's own tweets.

How sure each claim is:
- **[live]**: checked on 2026-10-11 against `https://x.com/i/jf/` and the `abs.twimg.com` bundles it loads (logged-out app shell, responsive-web build `main.759a3196d8872caea.js`).
- **[src]**: read in the cited open-source code or fixtures.
- **[unsure]**: from memory or inference, not verified. Test it before relying on it.

Primary sources:
- twscrape (Python, active, last commit 2026-10-05): https://github.com/vladkens/twscrape. See `twscrape/xclid.py`, `api.py`, `queue_client.py`, `scripts/update-gql-ops.py`, and `tests/mocked-data/*.json`, which are real responses refreshed 2026-08-07.
- twikit (Python, last commit 2026-03-10): https://github.com/d60/twikit
- the-convocation/twitter-scraper (TS, v0.22.3, MIT): https://github.com/the-convocation/twitter-scraper. It depends on `x-client-transaction-id`.
- x-client-transaction-id (TS): https://github.com/Lqm1/x-client-transaction-id
- twitter-openapi placeholder config: https://github.com/fa0311/twitter-openapi/blob/main/src/config/placeholder.json
- TwitterInternalAPIDocument (a bot that extracts the bundle daily): https://github.com/fa0311/TwitterInternalAPIDocument/tree/develop/docs/json
- XActions (JS, active): https://github.com/nirholas/XActions. See `src/scrapers/twitter/http/dm.js` and `ROADMAP.md`.

---

## 1. Common headers

These are the headers the web client itself sets, from `main.js` **[live]**:

```
authorization: Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA
x-csrf-token: <ct0 cookie>            # document.cookie, ct0 is not HttpOnly
x-twitter-auth-type: OAuth2Session    # only when logged in
x-twitter-active-user: yes            # web client sends "no" when the tab is backgrounded
x-twitter-client-language: en         # user's UI language
x-client-transaction-id: <see below>
content-type: application/json        # POST mutations
```

- The bearer token is the public web token. The string is literally in `main.js` **[live]**, and twikit, twscrape and twitter-scraper use the same one **[src]**. twitter-scraper also has a second token (`AAAA…FQODgEAAAAAVHTp76lzh3rF…`) that it uses for some guest endpoints. We don't need it.
- Use the same origin, `https://x.com/i/api/...`. Cookies (`auth_token` HttpOnly, `ct0`, `twid`) attach automatically.
- Response headers `x-rate-limit-limit`, `x-rate-limit-remaining` and `x-rate-limit-reset` (epoch seconds) are present and CORS-exposed **[live]**.
- twitter-scraper also sends `x-xp-forwarded-for` (an AES-GCM blob derived from `guest_id`). That is only for guest or Node use. A real browser tab doesn't need it **[unsure]**.

### x-client-transaction-id

**How the web client does it [live]:** `main.js` wraps every request to hosts matching `/^(https:\/\/)?((jf|grok|api|mobile)\.)?(twitter|x)\.com/`. When the feature switch `rweb_client_transaction_id_enabled` is true (it is true in the user config today), it does:

```js
r.e(59924).then(() => r(564498)).then(m => m.default())   // chunk 59924 = "ondemand.s"
gen(path.split("?")[0], method)   // path = "/i/api/graphql/<qid>/TweetDetail"
// on error the client sends btoa(`e:${err}`)
```

**Algorithm**, as reimplemented in Lqm1 `transaction.ts` and twscrape `xclid.py` **[src]**:

1. Read `key` from the home HTML: `<meta name="twitter-site-verification" content="<base64>">`. Then `keyBytes = base64decode(key)`, which is about 48 bytes.
2. Fetch the `ondemand.s.<hash>a.js` chunk. Its URL comes from the webpack chunk maps in the HTML (`59924:"ondemand.s"` and `59924:"1a463dc165a885c6"` today). Hashes are 16 hex characters since about 2026-08-24, 7 before (twscrape commit #328). Collect all matches of `/\(\w\[(\d{1,2})\],\s*16\)/g`. The first match is `rowIndex`; the rest are `keyByteIndices`.
3. The HTML contains 4 SVGs, `[id^="loading-x-anim"]`. Pick `frames[keyBytes[5] % 4]`, then take `firstChild.children[1].getAttribute("d")`. Drop the first 9 characters, split on `"C"`, and keep only the digits of each segment. The result is a 2D int array.
4. `row = arr[keyBytes[rowIndex] % 16]`. `frameTime = round(prod(keyBytes[i] % 16 for i in keyByteIndices) / 10) * 10`. `t = frameTime / 4096`.
5. Animate the row: colors are `row[0..2]` to `row[3..5]`, rotation is 0 to `solve(row[6], 60, 360)`, and the cubic-bezier curve comes from `row[7..]`, evaluated at `t`. Hex-encode the color plus the rotation matrix, append `"0","0"`, and strip `.` and `-`. The result is `animationKey`.
6. Per request:
   - `ts = floor((Date.now() - 1682924400000) / 1000)`, as 4 little-endian bytes.
   - `h = SHA256(`${METHOD}!${path}!${ts}obfiowerehiring${animationKey}`)`.
   - `bytes = [...keyBytes, ...tsBytes, ...h.slice(0,16), 3]`.
   - `r = random byte`. `out = [r, ...bytes.map(b => b ^ r)]`.
   - Encode as base64 with `=` stripped. The result is about 94 characters.

**Is it required?** **[unsure]** No source shows a per-endpoint test for TweetDetail, FavoriteTweet or CreateTweet. What the sources do show:
- twscrape saw **HTTP 404** responses without it on SearchTimeline and others since about 2025-04-25 (https://github.com/vladkens/twscrape/issues/248). It now sends it on every request, regenerates it, and retries up to 3 times on a 404 (`queue_client.py`).
- twikit sends it on every request (`client.py`).
- twitter-scraper still treats it as experimental (`experimental.xClientTransactionId`).

Recommendation: always send it, as the real client does. A missing or invalid value is a cheap bot signal (226 risk). Treat a 404 on a known-good queryId as a signal to regenerate the ID once and retry.

**Library: `x-client-transaction-id`** (npm). v0.3.2, published 2026-09-26, **MIT**, by Lqm1. Also on JSR as `@lami/x-client-transaction-id`. Its only dependency is `linkedom ^0.18.9`. It ships ESM and CJS. https://www.npmjs.com/package/x-client-transaction-id

```ts
import { ClientTransaction } from "x-client-transaction-id";
const doc = new DOMParser().parseFromString(await (await fetch("/home")).text(), "text/html");
const ct = await ClientTransaction.create(doc);        // = new + initialize(); fetches ondemand.s via global fetch
const tid = await ct.generateTransactionId("POST", "/i/api/graphql/<qid>/CreateTweet");
// other exports: fetchXDocument() (fetches https://x.com/i/jf/ and parses with linkedom), Cubic, interpolate, floatToHex, ...
// errors: SiteVerificationKeyNotFoundError, OnDemandFileUrlResolutionError, OnDemandFileFetchError, KeyByteIndicesExtractionError, AnimationFrameDataError
```

- It worked on 2026-10-11 in Node: it produced a 94-character ID **[live]**. We have no auth, so server acceptance is not verified.
- In the extension:
  - Pass a document you parsed yourself. Don't call `fetchXDocument`, because it hardcodes a Windows Chrome user agent and imports linkedom; check that tree-shaking actually drops linkedom.
  - Cache the instance. The key changes per page load, so rebuild it when the user reloads or the meta key changes.
  - Fetching `abs.twimg.com` from the page works: it returns `access-control-allow-origin: https://x.com` **[live]**.
- Do not parse the live DOM. The `loading-x-anim` SVGs may be removed after hydration **[unsure]**. Re-fetch `/home` or `/i/jf/` instead.
- Risk: X is moving logged-out pages to a Vite "x-web" build, where the indices file is `sign.o-*.js`, not `ondemand.s` (twscrape `xclid.py`, mid-2026). Lqm1 0.3.2 only handles `ondemand.s`. The logged-in build was still the responsive-web/webpack one per twscrape **[src]**, and `/i/jf/` served it **[live]**. If the library breaks, port twscrape's `get_scripts_list` and `INDICES_FILE_RE` logic.
- Alternative: since we run in the MAIN world, call X's own generator. Find the `r.e(<chunk>).then(()=>r(<module>))` pair near `"jf.x.com"` in `main.js`. Get `__webpack_require__` by pushing into `window.webpackChunk_twitter_responsive_web`. Call `(await req(module).default())(path, method)`. Both IDs change per build, so this is fragile but always byte-exact **[unsure, untested]**.

---

## 2. Logged-in user (id, handle, Premium)

| Source | How | Notes |
|---|---|---|
| `twid` cookie | `decodeURIComponent(cookie.twid)`, which is `u=<id>`; then `/u=(\d+)/` | Readable by JS: X's own `main.js` reads `twid` from `document.cookie` with `/u=(\d+)/` **[live]**. Fastest, and gives the id only. |
| `Viewer` GraphQL | GET, queryId `TpQxQtWMTMnIAMPlMGMqNw` **[live]**. Variables: `{"withCommunitiesMemberships":true}`. fieldToggles: `{"isDelegate":false,"withAuxiliaryUserLabels":false}`. Features are the 7 listed in its metadata. | Response: `data.viewer.user_results.result` (a User, shape in §3), plus `data.viewer.user_features[] {feature, enabled}`, `is_tfe_restricted_session` and `data.is_super_follow_subscriber` (from the `fetchViewer` parser in `main.js` **[live]**). |
| `window.__INITIAL_STATE__` | Present in the HTML as `window.__INITIAL_STATE__=` **[live]** | Logged-in fields such as `session.user_id` and `entities.users.entities[id]` (`screen_name`, `is_blue_verified`) are **[unsure]**: the snapshot we saw was logged out. It also holds `featureSwitch.{defaultConfig,user.config}`, which §6 uses. |
| REST | `GET /i/api/1.1/account/settings.json` returns `screen_name` (twikit). XActions uses `GET /i/api/1.1/account/verify_credentials.json` to get `id_str`. | `verify_credentials` is not referenced in `main.js` **[live]**, so prefer Viewer. |

Premium status: `is_blue_verified` (bool) on the User. `verification.verified_type` is `"Business"` or `"Government"` for gold and grey checkmarks. Premium tiers (Basic, Premium, Premium+) are not distinguished on the User object **[unsure]**.

---

## 3. TweetDetail (replies to a tweet)

**queryIds rotate every few weeks.** Observed values: `oCon7R-cgWRFy6EfZjaKfg` (twitter-openapi, 2026-05), `XMOz5h24KAZ86qKffKTLdQ` (twscrape, 2026-08), `zoF7_t363wZyzylk-BLfZQ` (TIAD, 2026-09-24), and **`3BlMtudy4N-d78ch7zTLZQ` (live, 2026-10-11)**. Discover them at runtime (§6).

`GET /i/api/graphql/<qid>/TweetDetail?variables=<json>&features=<json>&fieldToggles=<json>`. Each parameter is URL-encoded JSON.

```jsonc
// variables (built by the web client's fetchTweetDetail in main.js [live])
{ "focalTweetId": "<id>", "cursor": "<opt>", "referrer": "tweet", "with_rux_injections": false,
  "rankingMode": "Recency",            // "Relevance" (default) | "Recency" | "Likes"  [live, sort_replies UI]
  "includePromotedContent": true, "withCommunity": true, "withQuickPromoteEligibilityTweetFields": true,
  "withBirdwatchNotes": true, "withVoice": true }
// fieldToggles
{ "withArticleRichContentState": true, "withArticlePlainText": false, "withArticleSummaryText": true,
  "withArticleVoiceOver": true, "withGrokAnalyze": false, "withDisallowedReplyControls": false }
// features (TIAD 2026-09-24 defaults; build from metadata at runtime, see §6)
{"rweb_video_screen_enabled":false,"rweb_cashtags_enabled":true,"profile_label_improvements_pcf_label_in_post_enabled":true,
"responsive_web_profile_redirect_enabled":true,"rweb_tipjar_consumption_enabled":false,"verified_phone_label_enabled":false,
"creator_subscriptions_tweet_preview_api_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true,
"premium_content_api_read_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,
"c9s_tweet_anatomy_moderator_badge_enabled":true,"responsive_web_grok_analyze_button_fetch_trends_enabled":false,
"responsive_web_grok_analyze_post_followups_enabled":false,"rweb_cashtags_composer_attachment_enabled":true,
"responsive_web_jetfuel_frame":true,"rweb_sports_post_context_enabled":true,"responsive_web_grok_share_attachment_enabled":true,
"responsive_web_grok_annotations_enabled":true,"articles_preview_enabled":true,"responsive_web_edit_tweet_api_enabled":true,
"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,
"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,
"content_disclosure_indicator_enabled":true,"content_disclosure_ai_generated_indicator_enabled":true,
"responsive_web_grok_show_grok_translated_post":true,"responsive_web_grok_analysis_button_from_backend":true,
"post_ctas_fetch_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,
"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"longform_notetweets_rich_text_read_enabled":true,
"longform_notetweets_inline_media_enabled":false,"responsive_web_nested_quote_preview_enabled":false,
"responsive_web_grok_image_annotation_enabled":true,"responsive_web_grok_imagine_annotation_enabled":true,
"responsive_web_grok_community_note_auto_translation_is_enabled":true,"responsive_web_enhance_cards_enabled":false}
```

A missing feature returns `errors[].code 336` with the message "The following features cannot be null: a, b". twscrape parses the names from that message and self-heals (`queue_client.py`, `MISSING_FEATURES_RE`).

### Response shape

The following is **[src]**, from twscrape `raw_tweet_replies.json` (2026-08) and twikit `get_tweet_by_id`.

```
data.threaded_conversation_with_injections_v2.instructions[]
  { type: "TimelineClearCache" }
  { type: "TimelineAddEntries", entries: [...] }
  { type: "TimelineTerminateTimeline", direction: "Top" }
  { type: "TimelineAddToModule", moduleEntryId, moduleItems: [...] }   // response to a ShowMore cursor
```

Entries:
- `tweet-<focalId>`: `content.__typename = "TimelineTimelineItem"`, `content.itemContent.tweet_results.result`. This is the focal tweet. Ancestors appear before it if it is itself a reply.
- `conversationthread-<replyId>`: `content.__typename = "TimelineTimelineModule"`, `displayType: "VerticalConversation"`, and `items[]`, where each item is `{ entryId: "conversationthread-<X>-tweet-<id>", item: { itemContent: { itemType: "TimelineTweet", tweetDisplayType: "Tweet" | "SelfThread", tweet_results } } }`. `items[0]` is the direct reply. Later items are the nested thread below it.
- An in-module cursor, `conversationthread-<X>-cursor-showmore-<n>`, has `itemContent: { __typename: "TimelineTimelineCursor", cursorType: "ShowMore", value }`. Pass the value as `cursor` and you get a `TimelineAddToModule` back **[src twikit; entryId pattern unsure]**.
- `cursor-bottom-<n>`: in current data this is `content: { __typename: "TimelineTimelineCursor", cursorType: "Bottom", value }`. Older payloads put it under `content.itemContent.value`, so handle both. Paginate with `cursor = value` until there is no Bottom cursor or the page has no new tweets.
- Low-quality or "probable spam" replies sit behind a `ShowMoreThreads` or `ShowMoreThreadsPrompt` cursor. twscrape paginates replies on `cursorType == "ShowMoreThreads"` **[src]**.
- Ignore entries starting with `tweetdetailrelatedtweets-`, `cursor-top-`, `label-`, `module-` or `who-to-follow-`.

Per tweet (`result`):
- Unwrap `__typename === "TweetWithVisibilityResults"` to `result.tweet`.
- Skip `TweetTombstone` and `TweetUnavailable`.

| Field | Path |
|---|---|
| tweet id | `result.rest_id` (or `legacy.id_str`) |
| text | `result.note_tweet?.note_tweet_results.result.text ?? legacy.full_text` (long posts are truncated in `full_text`) |
| parent | `legacy.in_reply_to_status_id_str`. A direct reply is one where this equals `focalTweetId`. Also `legacy.in_reply_to_user_id_str` and `legacy.conversation_id_str`. |
| author id | `result.core.user_results.result.rest_id` (or `legacy.user_id_str`) |
| screen_name / name | `user.core.screen_name` / `user.core.name` (current). The old `user.legacy.screen_name` was removed. |
| follows me | `user.relationship_perspectives.followed_by` |
| I follow them | `user.relationship_perspectives.following` |
| can DM | `user.dm_permissions.can_dm` (bool, exposed on User results). This is the viewer's view. Whether it reflects XChat reachability is **[unsure]**. |
| other | `user.is_blue_verified`, `user.verification.verified_type`, `user.privacy.protected`, `user.avatar.image_url` |

**User shape migration [src]:** In twscrape fixtures, `user.legacy` had `screen_name`, `following` and `can_dm` in 2025-03. By 2026-05 `core`, `dm_permissions` and `relationship_perspectives` had been added. By the **2026-08 fixtures, `user.legacy` is gone entirely**. Read the new paths and fall back to `legacy.*`. Tweet `legacy` still exists.

Trimmed example (built from the 2026-08 fixture shape):

```json
{"data":{"threaded_conversation_with_injections_v2":{"instructions":[
 {"type":"TimelineAddEntries","entries":[
  {"entryId":"tweet-1900000000000000001","content":{"__typename":"TimelineTimelineItem","entryType":"TimelineTimelineItem",
   "itemContent":{"itemType":"TimelineTweet","tweet_results":{"result":{"__typename":"Tweet","rest_id":"1900000000000000001",
    "core":{"user_results":{"result":{"__typename":"User","rest_id":"111","core":{"screen_name":"me","name":"Me"}}}},
    "legacy":{"full_text":"Reply 'GUIDE' and I'll DM it","conversation_id_str":"1900000000000000001","user_id_str":"111"}}}}}},
  {"entryId":"conversationthread-1900000000000000050","content":{"__typename":"TimelineTimelineModule","displayType":"VerticalConversation",
   "items":[{"entryId":"conversationthread-1900000000000000050-tweet-1900000000000000050","item":{"itemContent":{
    "itemType":"TimelineTweet","tweetDisplayType":"Tweet","tweet_results":{"result":{"__typename":"Tweet","rest_id":"1900000000000000050",
     "core":{"user_results":{"result":{"__typename":"User","id":"VXNlcjoyMjI=","rest_id":"222",
      "core":{"created_at":"Sat Dec 14 04:35:55 +0000 2013","name":"Jane","screen_name":"jane"},
      "dm_permissions":{"can_dm":true},"is_blue_verified":false,"verification":{"verified":false},
      "privacy":{"protected":false},
      "relationship_perspectives":{"blocked_by":false,"blocking":false,"followed_by":true,"following":false,"muting":false}}}},
     "legacy":{"full_text":"@me GUIDE","in_reply_to_status_id_str":"1900000000000000001","in_reply_to_user_id_str":"111",
      "in_reply_to_screen_name":"me","conversation_id_str":"1900000000000000001","user_id_str":"222","favorited":false}}}}}}]}},
  {"entryId":"cursor-bottom-2085474386491473579","content":{"__typename":"TimelineTimelineCursor","entryType":"TimelineTimelineCursor",
   "cursorType":"Bottom","value":"DAAKCgABHPEX..."}}]},
 {"type":"TimelineTerminateTimeline","direction":"Top"}]}}}
```

`legacy.favorited` on the reply tells whether we already liked it. Use it for idempotency.

---

## 4. FavoriteTweet and CreateTweet

GraphQL mutation transport: `POST /i/api/graphql/<qid>/<Op>`, with body `{"variables":{...},"features":{...},"queryId":"<qid>"}` (twikit `gql_post` **[src]**). FavoriteTweet has no features.

**FavoriteTweet**: qid `lI07N6Otwv1PhnEgXILM7A`. It has been stable for years and is still current on 2026-10-11 **[live]**.

```json
{"variables":{"tweet_id":"1900000000000000050"},"queryId":"lI07N6Otwv1PhnEgXILM7A"}
// success: {"data":{"favorite_tweet":"Done"}}
// already liked: HTTP 200, errors[].code 139 ("Has already favorited tweet") [unsure exact text]
```

**CreateTweet**: qid **`wR5Z_lEibLvkew3tF9w-Sg` (live, 2026-10-11)**. Older values: `GYdIGqVWfZNho79bQ2XDoA` (TIAD, 2026-09-24) and `5CdvsV_zjv4L64XFifAglw` (twitter-openapi). Rotate at runtime.

```jsonc
{"variables":{
  "tweet_text":"Sent you a DM 👋",
  "reply":{"in_reply_to_tweet_id":"1900000000000000050","exclude_reply_user_ids":[]},
  "dark_request":false,
  "media":{"media_entities":[],"possibly_sensitive":false},
  "semantic_annotation_ids":[],
  "disallowed_reply_options":null },
 "features":{ /* names from CreateTweet metadata.featureSwitches, about 36 flags; same family as TweetDetail */ },
 "queryId":"wR5Z_lEibLvkew3tF9w-Sg"}
```

- Text longer than 280 characters (Premium) goes through `CreateNoteTweet`. Its response sits at `data.notetweet_create.tweet_results` (twikit).
- Success: `data.create_tweet.tweet_results.result` is a normal Tweet object (`rest_id`, `legacy.full_text`, `legacy.in_reply_to_status_id_str`, ...).
- Soft failure: HTTP 200 with `data.create_tweet.tweet_results = {}` and no errors has been reported for shadow-limited writes **[unsure]**. Treat a missing `rest_id` as a failure.

### Errors: where they appear

GraphQL usually returns **HTTP 200** with an `errors[]` array, often alongside `data:{}` or partial data. The code appears in both `errors[i].code` and `errors[i].extensions.code`. Twikit checks both **[src]**.

```json
{"errors":[{"message":"Authorization: This request looks like it might be automated. ... (226)",
  "locations":[{"line":18,"column":3}],"path":["create_tweet"],
  "extensions":{"name":"AuthorizationError","source":"Client","code":226,"kind":"Permissions","tracing":{"trace_id":"..."}},
  "code":226,"kind":"Permissions","name":"AuthorizationError","source":"Client","tracing":{"trace_id":"..."}}],
 "data":{}}
```

The envelope above is **[unsure]**: it is the commonly seen shape, written from memory, with fields matching what twikit reads.

| Code | Meaning | Where |
|---|---|---|
| 88 | Rate limit exceeded | HTTP **429** with `x-rate-limit-remaining: 0`; also as `errors[].code` in HTTP 200. twscrape: 88 while `remaining > 0` means the account is effectively banned or limited. |
| 226 | "looks like it might be automated" | HTTP 200, `errors[]`, on writes. Back off for hours. |
| 326 | Account temporarily locked (`/account/access`, Arkose challenge) | `errors[]`, often HTTP 200 or 403. twscrape and twikit treat it as a hard stop. |
| 32 / 64 / 37 | Could not authenticate / suspended | `errors[]`, or HTTP 401/403 |
| 185 | Over daily status update limit (any posting limit) | `errors[]` on CreateTweet. The documented v1.1 status is 403. |
| 187 | Duplicate status | `errors[]` on CreateTweet. **Vary reply text.** |
| 344 | Reported in the wild as a daily-limit error | **[unsure]** No authoritative source found. |
| 336 | Features cannot be null | HTTP 400 or 200 `errors[]`. Rebuild features. |
| 139 / 144 / 385 / 433 | Already liked / no such status / reply target deleted or not visible / author restricted replies | `errors[]` **[unsure exact codes for GraphQL path]** |
| -1 `LoadShed` | X overloaded | `errors[]`. Retry with backoff (twscrape). |
| HTTP 404 | Stale queryId, **or** a missing or invalid `x-client-transaction-id` | Regenerate the transaction ID once, then re-discover queryIds. |
| HTTP 403 with no errors | Session expired or banned (twscrape) | |

Publicly documented posting limits: unverified accounts get 50 original posts and 200 replies per day; follows are capped at 400 per day (https://help.x.com/en/rules-and-policies/x-limits).

---

## 5. DMs in 2026: legacy REST vs XChat

Timeline (with sources):
- **2025-05-30**: XChat (E2EE) beta (https://techcrunch.com/2025/05/30/xs-new-dm-feature-xchat-is-rolling-out-in-beta/).
- **2025-09-04**: broader rollout (https://techcrunch.com/2025/09/04/xs-encrypted-dm-feature-xchat-is-rolling-out-more-broadly/).
- **2026-01-07**: a Rettiwt-API contributor reports that the legacy `/1.1/dm/*` endpoints are "currently working" (https://github.com/Rishikant181/Rettiwt-API/issues/836). Later in the same thread, `dm/conversation` returns **401** for *encrypted* group conversations while 1:1 works. The contributor then says X moved DM *reading* to internal GraphQL with TLV/Thrift payloads.
- **2026-04-22**: Zendesk says X "is migrating DMs to XChat". Legacy accounts see no immediate disruption, but they may not receive DMs from or to migrated users without XChat (https://support.zendesk.com/hc/en-us/articles/10542709943450).
- **2026-08 to 09**: Cyd (an X archiving tool) reports that the web app no longer calls the legacy DM JSON endpoints, and closes its XChat effort on 2026-09-14 (https://github.com/lockdown-systems/cyd/pull/692). XActions (2026-09-14) still sends via legacy `/1.1` and says "legacy DM endpoints go dark as migration completes" (`ROADMAP.md`; https://github.com/nirholas/XActions/issues/37).
- **Official**: XChat API with the Chat XDK (`@xdevplatform/chat-xdk`, MIT). OAuth2 user context, `dm.read` and `dm.write`, client-side encryption (https://docs.x.com/xchat/introduction). The v2 `dm_events` endpoint only sees legacy, unencrypted DMs.

**What the live bundle shows (2026-10-11) [live]:**
- The legacy DM API client is **still shipped**, in a shared chunk named `shared~bundle.AudioSpaceAnalytics~…`:
  - `sendMessage` does `POST dm/new2` (that is, `/i/api/1.1/dm/new2.json`) with a JSON body containing only these whitelisted keys: `text, request_id, include_cards, cards_platform, dm_users, strato_ext, include_quote_count, simple_quoted_tweet, conversation_id, recipient_ids, media_id, tweet_id, card_uri, reply_to_dm_id, …`. The other parameters (`include_groups`, `supports_reactions`, `ext=mediaColor,altText`, …) go in the query string.
  - `fetchPermissions` does `GET dm/permissions` with `{recipient_ids: ids.join(","), dm_users: true}` and returns `{permissions:{id_keys:{"<uid>":{can_dm:bool, error_code?:int}}}}`.
  - `fetchSecretPermissions` hits `dm/permissions/secret` for conversation ids prefixed with `e` (encrypted).
- The feature switch `responsive_web_chat_enabled: true` is on, and there are many `rweb_xchat_*` flags. The web DM UI is XChat (`/i/chat`) by default, so the legacy path is probably a fallback or for unmigrated accounts **[inference]**.

Legacy send (twikit and XActions **[src]**):

```jsonc
POST /i/api/1.1/dm/new2.json   (content-type: application/json, same headers as §1)
{"conversation_id":"<lowId>-<highId>",   // 1:1 id = the two user ids, numerically sorted, joined by "-"
 "recipient_ids":false, "request_id":"<uuid v4>", "text":"...",
 "cards_platform":"Web-12","include_cards":1,"include_quote_count":true,"dm_users":false}
// alt for a new 1:1 conversation (XActions dms.js): "recipient_ids":"<theirId>" with no conversation_id
// success: {"entries":[{"message":{"id":"...","time":"<ms>","conversation_id":"A-B","request_id":"...",
//   "message_data":{"text":"...","sender_id":"...","recipient_id":"..."}}}],"users":{...}}
// failure: errors[] e.g. 349 "You cannot send messages to this user", 150 "...users who are not following you", 151 generic  [unsure exact codes today]
```

Pre-check: `GET /i/api/1.1/dm/permissions.json?recipient_ids=<id1>,<id2>&dm_users=true`, plus `user.dm_permissions.can_dm` from TweetDetail (§3).

**Unknown, and the DM spike must answer it:** does a `new2.json` message sent to a recipient who uses XChat actually show up in their XChat inbox, and does `can_dm` reflect that?

Test matrix: sender legacy or XChat × recipient legacy or XChat × recipient follows or doesn't follow × open or closed DMs.

What others do when legacy DMs fail:
1. **Public reply fallback** (most common): reply with a link, or with "check your requests", and skip the DM.
2. **Prefill and let the human send**: open the compose UI for the recipient (legacy deep link `https://x.com/messages/compose?recipient_id=<id>&text=<urlenc>`; the XChat equivalent is **[unsure]**).
3. **Reverse-engineer XChat GraphQL** (`SendMessageCreateMutation`, `GetPublicKeys`, `DmAvPermissionsQuery`, `GenerateXChatTokenMutation`, websocket `wss://chat-ws.x.com/ws`, Thrift payloads, P-256 keys plus Juicebox PIN backup). Write-ups: https://emusks.tiago.zip/xchat/protocol and Rettiwt PR #856 (merged into `dev` 2026-09-18, read-side only, uses chat-xdk). This is heavy. None of these operations are in the responsive-web bundle we fetched; XChat is a separate app **[live]**.
4. **The official XChat API** with OAuth and chat-xdk. This is the clean but paid path.

---

## 6. Discovering queryIds and features at runtime

1. Find the bundle: `document.querySelector('script[src*="/responsive-web/client-web/main."]')?.src`. Fallback: `performance.getEntriesByType("resource")`. `fetch(src)` is allowed (`access-control-allow-origin: https://x.com`, immutable cache) **[live]**.
2. Extract operations (format **[live]** in `main.js`):

```js
const re = /queryId:"([^"]+)",operationName:"([^"]+)",operationType:"(query|mutation)",metadata:\{featureSwitches:\[([^\]]*)\],fieldToggles:\[([^\]]*)\]/g;
// TweetDetail, CreateTweet, FavoriteTweet, Viewer and UserByRestId are all in main.js today; other ops live in lazy chunks.
```

   twscrape's looser regexes (`scripts/update-gql-ops.py`) also cover the Vite or Relay "x-web" build:

```
queryId:[`"](.+?)[`"].+?operationName:[`"](.+?)[`"]
params:\{id:[`"]([^`"]+)[`"].+?name:[`"]([^`"]+)[`"].+?operationKind:[`"]
```

3. Build `features` the way the client does: for each name in `featureSwitches`, take `(__INITIAL_STATE__.featureSwitch.user.config[name] ?? .defaultConfig[name]).value === true`. If `window.__INITIAL_STATE__` has been cleared, re-parse it from the inline `<script>` that contains `window.__INITIAL_STATE__=` **[unsure whether it persists]**. Keep a hardcoded fallback set (§3) and self-heal from code 336.
4. Cache by bundle URL. Re-discover on a 404, on a 400 with `GRAPHQL_VALIDATION_FAILED`, or when the bundle hash changes.

Third-party mirrors, for a sanity check or offline fallback:
- TwitterInternalAPIDocument `docs/json/GraphQL.json` is updated daily, includes default feature values, and was last updated 2026-09-24.
- twitter-openapi `placeholder.json` was last updated 2026-05-20, so it is stale.

---

## Open questions and risks

- Whether `x-client-transaction-id` is enforced on TweetDetail, FavoriteTweet and CreateTweet specifically. Always send it.
- Whether legacy `dm/new2.json` delivers to XChat users. Spike needed (§5).
- The logged-in build could switch to the Vite "x-web" build. That would break the Lqm1 `ondemand.s` lookup and the `main.*.js` regex. twscrape already handles that case and is the reference to port.
- Exact error code numbers for GraphQL-side like, reply and DM failures (marked [unsure] above). Log raw `errors[]` in the spike.
