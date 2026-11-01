# API contract

Hand-written, OpenAPI-style description of the Express API. Every schema named here is exported from
`@approvals/contracts` (`packages/contracts/src`), and the server validates against it before using or sending data.

Base URL: `http://localhost:4000` (the web app proxies `/api/*`, so the browser calls same-origin `/api/...`).

## Conventions

- **Request bodies** are JSON, validated with the named Zod schema. A failure returns `400`.
- **Session header:** clients send `x-session-id: <uuid>` on every request. It keys the rate limiter. A missing or
  malformed id falls back to the IP, and each IP is also capped at 5× the per-session limit, so rotating ids doesn't
  bypass the limit.
- **Errors** always use `ApiErrorSchema`: `{ "error": { "code": string, "message": string } }`. A stack trace or an HTML
  error page is never returned.

| Status | `error.code`        | When                                                                                       |
| ------ | ------------------- | ------------------------------------------------------------------------------------------ |
| 400    | `invalid_request`   | Body is not valid JSON or fails its Zod schema. `message` lists the failing fields.        |
| 413    | `payload_too_large` | Body is over 32 KB.                                                                        |
| 404    | `not_found`         | Unknown route.                                                                             |
| 429    | `rate_limited`      | More than `RATE_LIMIT_PER_MIN` requests to `/api/ai/*` in a minute for this session.       |
| 500    | `internal_error`    | Unexpected error **before** a stream starts. Generic message, details only in server logs. |

- **AI unavailability is not an error.** No API key, a timeout, a model error or invalid model output all still return
  `200` with a deterministic fallback answer (see each endpoint).

### Streaming (SSE)

Streaming endpoints respond `200` with `Content-Type: text/event-stream`. Each event is one frame:

```
data: <JSON matching StreamEventSchema>\n\n
```

`StreamEventSchema` is a union discriminated on `type`:

| `type`             | Payload                                                         | Meaning                                                                                        |
| ------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `token`            | `text`                                                          | A chunk of streamed model text. Append it to the current message.                              |
| `summary_headline` | `text`, `pendingCount`, `source: 'ai' \| 'fallback'`            | Validated summary headline.                                                                    |
| `summary_item`     | `id`, `rank`, `urgency`, `reason`, `source: 'ai' \| 'fallback'` | One validated summary item.                                                                    |
| `sources`          | `chunkIds: string[]`                                            | Policy chunks the Help answer is grounded in.                                                  |
| `fallback`         | `reason`, `content`                                             | Non-AI answer. `reason` is `timeout`, `llm_error`, `invalid_output`, `no_api_key` or `forced`. |
| `done`             | (none)                                                          | Always the last event. The client closes the stream.                                           |

Rules every stream follows:

- It always ends with exactly one `done`.
- Once headers are sent, a failure becomes a `fallback` event and then `done`, never an HTTP error. Text already
  streamed stays valid. The `fallback` content follows it.
- If the client disconnects, the server aborts the upstream LLM call.

---

## `GET /api/health`

Response `200`:

```json
{ "ok": true, "llm": "configured" }
```

`llm` is `not_configured` when there's no API key or `FORCE_LLM_FAILURE=true`.

## `GET /api/approvals`

Response `200`: `ApprovalsResponseSchema`, `{ "items": ApprovalItem[] }`, in seed order. The UI fetches the queue here
instead of importing the data file.

## `POST /api/ai/greeting`

Request: `GreetingRequestSchema`

```json
{ "localTime": "14:05", "language": "en" }
```

Both fields are optional. `localTime` is the browser's local `HH:MM` and picks "Good morning/afternoon/evening".

Response `200` (JSON, not streamed): `GreetingResponseSchema`

```json
{
  "greeting": "Good afternoon! You have 4 items waiting for review, including 1 safety document.",
  "source": "template"
}
```

- `source: "ai"`: the model's JSON passed `GreetingSchema`.
- `source: "template"`: the deterministic template, used when the model is unavailable, times out or returns invalid
  output.

## `POST /api/ai/summary`

Request: `SummaryRequestSchema`, `{ "language"?: string }` (default `"en"`).

The server computes the urgency rank deterministically. The model only writes the headline text and the reason for each
item, as NDJSON. Each complete line is parsed and validated, then sent as soon as it is ready.

Events, in order:

1. `summary_headline`
2. `summary_item` × one per queue item, in rank order. A model line is dropped if its id is unknown, it is a duplicate,
   its rank differs from the deterministic rank, or it fails the schema. Any item without a valid line is sent with
   `source: "fallback"` and a deterministic reason.
3. `done`

If **no** valid line arrives (timeout, error, garbage), the stream is `fallback` (with the reason and a plain-text ranked
summary), then the headline and every item with `source: "fallback"`, then `done`.

## `POST /api/ai/help`

Request: `HelpRequestSchema`

```json
{ "question": "Who do I escalate an expired calibration to?", "messages": [] }
```

The policy note is split into one chunk per `##` section. Chunk ids are heading slugs: `review-slas`,
`content-checks-by-type`, `approve-reject-or-request-changes`, `safety-and-sensor-specifications`, `escalation`.

- **Relevant question:** `sources` (top 2 chunk ids), then `token`…, then `done`.
- **Off-topic question** (best retrieval score below the threshold): the LLM is **not** called. The stream is one
  `token` with "The policy doesn't cover this. Try asking about SLAs, content checks, approve/reject rules, safety specs
  or escalation.", then `done`.
- **LLM unavailable:** `sources`, then `fallback` whose `content` is the retrieved chunk text labelled "From the policy:",
  then `done`.

## `POST /api/ai/chat`

Request: `ChatRequestSchema`

```json
{ "mode": "talk", "messages": [{ "role": "user", "content": "What should I review first?" }] }
```

`mode` is `talk` (free-form chat about the queue) or `teach` (step-by-step review guide). There are 1–20 messages of at
most 2000 characters each, only `user`/`assistant` roles, and the last message is from the user. The queue is injected
server-side. Clients never send it.

Events: `token`…, then `done`. When the LLM is unavailable:

- `talk`: `fallback` with "The assistant is unavailable right now. Here's the current queue in priority order:" followed
  by the ranked list.
- `teach`: `fallback` with the static 5-step review guide.

---

## Review workflow and dashboard

These endpoints go beyond the five panel actions. Decisions and dashboard figures are computed in code; the AI only
writes text and filters, and every AI reply is validated with a deterministic fallback, like the actions above.
The queue lives in memory: a restart (or `POST /api/approvals/reset`) puts every item back to pending.

### `POST /api/approvals/:id/decision`

Request: `DecisionRequestSchema`, `{ "decision": "approve" | "request_changes" | "reject", "comment"?: string }`. A
comment (3–1000 characters) is required to request changes or reject.

Response `200`: `DecisionResponseSchema`, `{ "item": ApprovalItem }`, with `status`, `reviewedAt` and `reviewComment`
set. Errors: `404 not_found` for an unknown id, `409 already_decided` if the item was already reviewed.

### `POST /api/approvals/reset`

Puts every item back to its seeded state. Response `200`: `ApprovalsResponseSchema`.

### `GET /api/dashboard`

Response `200`: `DashboardSchema`. Counts by status, pending items by type, each pending item's deadline (submission
date plus the policy SLA: 24 h for safety items, 72 h otherwise, with `hoursLeft` negative once overdue) most urgent
first, and the five latest decisions. No AI.

### `POST /api/ai/review`

Request: `ReviewRequestSchema`, `{ "itemId": string }`. Response `200`: `ReviewResponseSchema`: the deadline (from code),
`source: "ai" | "fallback"`, and 2–6 checks, each citing a policy section. Checks citing a section the item wasn't given,
or quoting numbers the policy doesn't contain, are dropped. The AI never suggests approve or reject: it only sees the
item's metadata. Errors: `404`, `409` as above.

### `POST /api/ai/comment`

Request: `CommentDraftRequestSchema`, `{ "itemId", "decision": "request_changes" | "reject", "notes"?: string }`.
Response `200`: `CommentDraftResponseSchema`, `{ "comment", "source": "ai" | "template" }`. The reviewer edits it before
sending. A draft with numbers that aren't in the notes, the item or the policy falls back to the template.

### `POST /api/ai/briefing`

Response `200`: `BriefingResponseSchema`, `{ "briefing", "source": "ai" | "template" }`. The model words the dashboard
figures; it may not add numbers and must name the item code chose to start with, or the template is used.

### `POST /api/ai/search`

Request: `SearchRequestSchema`, `{ "query": string }`. Response `200`: `SearchResponseSchema`, `{ "query", "filter",
"itemIds", "source": "ai" | "keyword", "fallbackReason"? }`. A one-word query is a keyword match with no AI call. Otherwise
the model returns a filter limited to known types, statuses, urgencies and submitters, and code works out `itemIds`.
