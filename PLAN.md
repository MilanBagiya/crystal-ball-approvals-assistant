# PLAN.md: Approvals AI Assistant (Crystal Ball Sr. Fullstack MERN + AI take-home)

You are Claude Code, building this project with Milan. Read this whole file before writing any code.
Build **phase by phase**, in order. After each phase, run the tests, then **stop and give Milan a short summary** so he can review before you continue.

---

## 0. Goal

Rebuild the **"Approvals" assistant panel** from OomniEye's digital-twin dashboard as a working web app.
The panel has 5 actions, each backed by a real LLM call with a safe non-AI fallback:

| Action | What it does | Output style |
|---|---|---|
| **Present me Summary** | Summarises the pending approvals queue, ordered by urgency | Structured items, streamed one validated item at a time |
| **Talk to me** | Free-form multi-turn chat about the queue | Streamed text |
| **Help me** | Answers operational questions **only** from a policy note (mini RAG) | Streamed text + source chunk IDs |
| **Teach me** | Step-by-step guide on reviewing an approval, adapts to follow-ups | Streamed text, multi-turn |
| **Replay Greeting** | Short context-aware greeting (e.g. "4 items pending") | Structured JSON, validated |

What the graders care about most:
1. Meaningful tests (they read the tests first)
2. Judgment about when AI is and isn't needed
3. Zod-validated structured output, so the UI never trusts raw model text
4. Graceful failure: no API key or a timeout must never break the UI
5. A readable commit history that shows tests written first

**Prefer a smaller scope done to this standard over everything done shallowly.**

---

## 1. Rules for Claude Code

- **Strict TypeScript everywhere:** `strict: true`, `noImplicitAny`, no `any` (use `unknown` and narrow it).
- **No prompt strings inside route handlers.** All prompts live in `apps/api/src/prompts/*.ts` as versioned exports.
- **The LLM is called server-side only.** `ANTHROPIC_API_KEY` must never be referenced in `apps/web`.
- **Every request and response shape has a Zod schema** in `packages/contracts`. Validate before use.
- **TDD commit rhythm** for each feature:
  1. `test(<scope>): <behaviour> (red)`: add the failing test, run it, confirm it fails for the right reason, commit.
  2. `feat(<scope>): <behaviour> (green)`: write the minimum code to pass, commit.
  3. `refactor(<scope>): ...`: optional cleanup, commit.
- **Commits stay small and PR-sized.** Never squash.
- **Use only the dependencies listed in §2.** Ask Milan before adding anything else.
- **Pin exact versions** in package.json, with no `^` or `~`.
- **Keep code readable:** small functions, clear names, and a short comment where a decision isn't obvious.

---

## 2. Tech stack and structure

**Monorepo** using npm workspaces:

```
crystal-ball-approvals-assistant/
├─ apps/
│  ├─ web/            # Next.js (App Router) + React + Tailwind + Zustand + Vitest
│  └─ api/            # Node.js + Express + TypeScript + Jest + Supertest
├─ packages/
│  └─ contracts/      # Zod schemas + inferred types shared by web and api
├─ data/
│  ├─ approvals.json  # seeded queue (§3)
│  └─ policy.md       # approval policy note, the RAG source (§3)
├─ README.md
├─ PLAN.md
└─ .env.example
```

**Why Express instead of Next.js route handlers:** the brief requires Supertest integration tests, and Supertest works directly with an Express app. Record this in the README.

**Dependencies:**
- **api:**
  - Runtime: `express`, `@anthropic-ai/sdk`, `zod`, `express-rate-limit`, `cors`, `dotenv`
  - Dev: `typescript`, `tsx`, `jest`, `ts-jest`, `supertest`, `@types/*`
- **web:**
  - Runtime: `next`, `react`, `react-dom`, `zustand`, `zod`, `lucide-react`, `tailwindcss`
  - Dev: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `@vitejs/plugin-react`
- **contracts:** `zod`

**Environment** (`.env.example`):
```
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-5-5        # fast and cheap; overridable
LLM_TIMEOUT_MS=8000
FORCE_LLM_FAILURE=false                 # demo switch: forces the fallback path
RATE_LIMIT_PER_MIN=20
API_PORT=4000
```

In `next.config`, the web app proxies `/api/*` to `http://localhost:4000` via `rewrites`, so there's no CORS setup in the browser.

---

## 3. Data

### `data/approvals.json`
Seed the 4 items exactly as given:

| id | title | type | submittedBy | path | status | submittedAt |
|---|---|---|---|---|---|---|
| a1 | Site Patrol Onboarding & Checklists | folder | Sam HelpAdmin | My Site Patrol › My Site Patrol Card | pending_review | 2026-09-18 |
| a2 | Level 2 Drone Patrol Video Demo | video | Alex HelpAdmin | Drawing-Videos › Drawing-Videos Card | pending_review | 2026-09-18 |
| a3 | Safety Equipment & Sensor Specs | pdf | Sam HelpAdmin | Site Recordings › Site Recordings | pending_review | 2026-09-18 |
| a4 | 360° Spatial Zone Layout & Camera Map | image | Elena HelpAdmin | Site Recordings › Site Recordings | pending_review | 2026-09-18 |

Validate the file with a Zod `ApprovalItemSchema` when the server starts. If it's invalid, the server refuses to start with a clear error.

### Urgency assumption (put this in the README)
All items share the same date, and the data has no priority field, so urgency **can't be derived from the data alone**. The project uses a **deterministic, documented urgency rule in code**:
1. Safety-related content first. Detect it with keywords in the title: `safety`, `sensor`, `emergency`, `hazard`.
2. Then operational and onboarding content: `onboarding`, `checklist`, `patrol`.
3. Then reference media: `layout`, `map`, `demo`.
4. Break ties by oldest `submittedAt`, then by title.

The LLM **explains** the order. It doesn't **decide** it. The deterministic rank is passed into the prompt, and the server checks that the returned order matches.

### `data/policy.md`
Write a 250–350 word "Approval & Maintenance Policy" with **5 clearly headed sections**, each becoming one retrieval chunk:
1. Review SLAs (e.g. safety documents reviewed within 24h, other items within 72h)
2. What to check for each content type (folder, video, PDF, image)
3. Approve vs. reject vs. request changes (criteria)
4. Safety and sensor specification rules (e.g. specs must list calibration date and owner)
5. Escalation (who to contact, when to escalate)

Keep it realistic and specific so retrieval is easy to demonstrate.

---

## 4. Contracts (`packages/contracts`)

Define the Zod schemas and export the inferred types:

- `ApprovalItemSchema`
- `ChatMessageSchema` = `{ role: 'user' | 'assistant', content: string (1..2000) }`
- Requests:
  - `SummaryRequestSchema` = `{ language?: string (default 'en') }`
  - `GreetingRequestSchema` = `{ localTime?: string, language?: string }`
  - `ChatRequestSchema` = `{ mode: 'talk' | 'teach', messages: ChatMessage[] (1..20) }`
  - `HelpRequestSchema` = `{ question: string (3..500), messages?: ChatMessage[] (max 10) }`
- Structured AI outputs (validated **server-side** before being sent):
  - `SummaryHeadlineSchema` = `{ type: 'headline', text: string (max 300), pendingCount: number }`
  - `SummaryItemSchema` = `{ type: 'item', id: string, rank: number, urgency: 'high' | 'medium' | 'low', reason: string (max 240) }`
  - `GreetingSchema` = `{ greeting: string (max 220) }`
- SSE event union `StreamEventSchema` (discriminated on `type`):
  - `{ type: 'token', text }`: streamed text chunk
  - `{ type: 'summary_headline', ... }` and `{ type: 'summary_item', ... }`: validated structured parts
  - `{ type: 'sources', chunkIds: string[] }`: for Help me
  - `{ type: 'fallback', reason: 'timeout' | 'llm_error' | 'invalid_output' | 'no_api_key' | 'forced', content }`: the non-AI answer
  - `{ type: 'done' }`
- `ApiErrorSchema` = `{ error: { code: string, message: string } }`

**OpenAPI-first spirit:** write `packages/contracts/openapi.md`, a short hand-written description of each endpoint (method, path, request schema, response events, errors). Do this **before** implementing the routes.

---

## 5. Backend (`apps/api`)

### Endpoints

| Method | Path | Behaviour |
|---|---|---|
| POST | `/api/ai/greeting` | JSON response `{ greeting, source: 'ai' or 'template' }` |
| POST | `/api/ai/summary` | SSE: headline, then items one by one, each Zod-validated |
| POST | `/api/ai/chat` | SSE: streamed tokens (modes `talk` and `teach`) |
| POST | `/api/ai/help` | SSE: `sources` event, then streamed tokens grounded in the retrieved chunks |
| GET | `/api/approvals` | Returns the seeded queue (so the UI doesn't import the data file directly) |
| GET | `/api/health` | `{ ok: true, llm: 'configured' or 'not_configured' }` |

### Layers
```
routes/ → validate (Zod middleware) → services/ (business logic) → llm/ (client interface)
```

- **`llm/LlmClient.ts`** defines an interface, so tests can inject a fake:
  ```ts
  interface LlmClient {
    streamText(args: { system: string; messages: ChatMessage[]; maxTokens: number }, signal: AbortSignal): AsyncIterable<string>;
    completeText(args: { system: string; messages: ChatMessage[]; maxTokens: number }, signal: AbortSignal): Promise<string>;
  }
  ```
  - `AnthropicLlmClient`: the real implementation using `@anthropic-ai/sdk` streaming.
  - `createApp({ llm, config })`: the app factory takes the client as a dependency, which keeps Supertest tests simple.
  - If there is no API key or `FORCE_LLM_FAILURE=true`, use `UnavailableLlmClient`, which always throws a typed error. Every endpoint then returns its fallback.
- **`llm/withTimeout.ts`** wraps any LLM call with an `AbortController`:
  - Non-streaming calls are aborted after `LLM_TIMEOUT_MS` (8s).
  - Streaming calls have **8s to produce the first token**, and an **8s idle timeout** between tokens.
  - On a timeout or error mid-stream, the server sends a `fallback` event (partial text stays visible in the UI), then `done`.
- **`llm/usageLog.ts`** logs model, input tokens, output tokens, latency and outcome (`ok`, `timeout`, `error`, `fallback`) for every LLM call to the console as one JSON line. This mirrors the JD's "token cost governance."

### Prompts (`apps/api/src/prompts/`)
Each file exports a versioned prompt object:
```ts
export const summaryPromptV1 = {
  id: 'summary',
  version: '1.0.0',
  system: `...`,
  buildUserMessage: (input: {...}) => string,
} as const;
```
- **Files:** `greeting.v1.ts`, `summary.v1.ts`, `talk.v1.ts`, `teach.v1.ts`, `help.v1.ts`, and `index.ts` (a registry of the active versions).
- **Every prompt says:** use only the provided queue or policy data, don't invent items, keep it concise.
- **summary.v1** tells the model to output **NDJSON**: one headline line, then exactly one line per item, in the given rank order, matching the schemas.
- **help.v1** tells the model to answer **only** from the provided chunks, cite chunk IDs, and say "The policy doesn't cover this" otherwise.
- **teach.v1** has the model teach in numbered steps, one concept at a time, ending each reply by inviting a follow-up.

### Service details

**Greeting service** (AI-optional):
- Build a deterministic template, e.g. "Good afternoon! You have 4 items waiting for review, including 1 safety document."
- Call the LLM to make it sound natural. Parse the JSON and validate it with `GreetingSchema`.
- If it times out, errors or fails validation, return the template with `source: 'template'`.

**Summary service:**
- Compute the deterministic urgency rank (§3).
- Stream from the LLM and split the output into **complete lines**. Parse each line as JSON and validate it with Zod.
- Send each valid line as an SSE event as soon as it's complete. This is streaming and structured output at the same time.
- **Reject an item if:** its ID isn't in the queue, it duplicates an earlier item, its rank doesn't match the deterministic rank, or it fails the schema. Log each rejection.
- When the stream ends, send a deterministic fallback event for every queue item that has no valid line. If **nothing** valid arrived, send a full `fallback` summary built from the template.

**Help service** (mini RAG):
- Split `policy.md` into chunks on the `##` headings.
- Score each chunk against the question with simple keyword scoring (lowercase, remove stopwords, term overlap plus title boost). Take the top 2.
- **AI judgment rule:** if the best score is below the threshold, **don't call the LLM**. Return a deterministic "The policy doesn't cover this. Try asking about SLAs, content checks, approve/reject rules, safety specs or escalation."
- Otherwise, send a `sources` event, then stream the answer with only the retrieved chunks in the prompt.
- **Fallback:** return the retrieved chunk text itself, labelled "From the policy:".

**Chat service** (Talk and Teach):
- Validate the message history: max 20 messages, max 2000 characters each.
- Inject the queue as context in the system prompt and stream the reply.
- **Talk fallback:** "The assistant is unavailable right now. Here's the current queue in priority order:" followed by the deterministic ranked list.
- **Teach fallback:** a static 5-step guide in `src/content/teachSteps.ts`.

### Cross-cutting middleware
- **Zod validation:** a `validate(schema)` middleware returns `400 { error: { code: 'invalid_request', ... } }`.
- **Rate limiting:** `express-rate-limit` on `/api/ai/*`, keyed by the `x-session-id` header (fall back to IP), `RATE_LIMIT_PER_MIN` per minute. Return `429` with the `ApiErrorSchema` shape. In-memory is fine; explain in the README that production would use Redis.
- **Central error handler:** maps any error to the `ApiErrorSchema` shape. A raw stack trace or HTML 500 must never leak. Once SSE headers are sent, errors become `fallback` and `done` events instead.
- **SSE helper:** set the right headers, write `data: <json>\n\n`, flush, and handle client disconnect by aborting the LLM call.

---

## 6. Frontend (`apps/web`)

### Layout
- **Page:** a simplified "Approvals & Review" page with a left-side table of the 4 items (fetched from `/api/approvals`) and a "4 items" badge.
- **Assistant panel:** floating at the bottom-right, matching the reference structure. **Don't copy OomniEye's illustrations or logo.** Use `lucide-react` icons and simple original visuals.
  - **Header:** dark navy bar, round avatar (a simple bot icon), title "Approvals", info / expand / **close (X)** buttons.
  - **Sub-bar:** "🏠 Approvals" on the left, **"Replay Greeting"** as an orange text button on the right.
  - **Greeting:** shown at the top, loaded on open.
  - **Home view:** a **2×2 grid of cards**: Present me Summary, Talk to me, Help me, Teach me.
  - **Action view:** a back arrow, conversation area, input box (for Talk, Help, Teach) and send button.
  - **Footer:** "4 items" on the left, "HMS Panel ↗" on the right.
  - **Closed state:** a round floating button reopens the panel.
- **Accessibility:** buttons have labels, the streaming area uses `aria-live="polite"`, and focus is managed when switching views.
- **Responsive:** on mobile, the panel goes full-width at the bottom.

### State (Zustand), `store/assistantStore.ts`
- `isOpen`, `view: 'home' | 'summary' | 'talk' | 'help' | 'teach'`
- `greeting: { text, source, status }`
- `conversations: Record<mode, ChatMessage[]>`
- `summary: { headline?, items: SummaryItem[] }`
- `status: 'idle' | 'loading' | 'streaming' | 'done' | 'error' | 'fallback'`, plus `fallbackReason?` and `error?`
- `sessionId`: generated once with `crypto.randomUUID()` and kept in memory
- No prop-drilling: components read from the store.

### Streaming client, `lib/sseClient.ts`
- Use `fetch` POST and read `response.body` with a `ReadableStream` reader. Split on `\n\n` and parse each `data:` line with `StreamEventSchema.safeParse`. **Ignore invalid events.**
- Show `token` events as they arrive.
- Show `fallback` events as a subtle notice ("AI unavailable, showing a standard answer") followed by the fallback content.
- Map network errors and 429/400/500 responses to a friendly error state with a **Retry** button.
- A client-side safety timeout (15s with no events) moves the panel to the error state, so the UI never freezes.

### UI states that must be visible
- **Loading:** skeleton or typing dots before the first token.
- **Streaming:** text growing with a blinking caret.
- **Done:** final message.
- **Fallback:** notice plus the fallback content.
- **Error:** message plus Retry.
- **Rate-limited:** "Too many requests, please wait a moment."

---

## 7. Tests

**Rule for every feature:** write the failing test first, then the code, as in §1.

### API: Jest unit tests (LLM mocked)
- `urgency.test.ts`: the rank puts the safety PDF first, the order is deterministic, and ties are broken correctly.
- `summaryParser.test.ts` (**the main one**):
  - Valid NDJSON lines become validated events in order.
  - A line with an unknown item ID, a wrong rank, a duplicate, or broken JSON is dropped.
  - A partial line split across chunks is joined correctly.
  - When every line is invalid, the result is a full fallback.
  - Items missing from the model output get deterministic fallback items.
- `greetingService.test.ts`: valid AI JSON returns `source: 'ai'`. Invalid JSON, a timeout or an error each return `source: 'template'`.
- `retrieval.test.ts`: a question about "safety specs" returns the safety chunk first, and an off-topic question falls below the threshold.
- `helpService.test.ts`: below the threshold, the LLM is **not called** (assert the mock was never called).
- `withTimeout.test.ts`: aborts after the timeout (use a short timeout in tests or fake timers).

### API: Supertest integration tests
- `summary.int.test.ts`:
  - **Success:** a fake LLM streams valid NDJSON. The response is `text/event-stream` and contains the headline, 4 `summary_item` events and `done`.
  - **Timeout:** a fake LLM never yields (test timeout ~50ms). The response is still 200 and contains a `fallback` event with reason `timeout`, then `done`. No 500.
  - **Invalid output:** a fake LLM yields garbage, which produces `fallback` with reason `invalid_output`.
- `help.int.test.ts`: success returns `sources` then tokens. The fallback path returns the policy chunk text.
- `validation.int.test.ts`: a bad body returns 400 in the `ApiErrorSchema` shape.
- `rateLimit.int.test.ts`: requests over the limit return 429 in the error shape.
- `noApiKey.int.test.ts`: with `UnavailableLlmClient`, every AI endpoint degrades gracefully.

### Web: Vitest + Testing Library
- `AssistantPanel.test.tsx`: renders the header, close button and 4 cards. Close hides the panel, and the floating button reopens it.
- `ChatView.test.tsx`, using a mocked `fetch` that returns a controllable `ReadableStream`:
  - **Loading:** shows typing dots before the first event.
  - **Streaming:** text appears progressively as token events are pushed.
  - **Error:** a rejected fetch or 500 shows the error message and a Retry button.
  - **Fallback:** a `fallback` event shows the notice and the fallback content.
- `sseClient.test.ts`: parses events split across chunk boundaries and ignores invalid events.

**Scripts:** the root `npm test` runs api and web tests. Also add `npm run test:api`, `npm run test:web` and `npm run coverage`.

---

## 8. Build phases (commit as you go)

1. **Scaffold:** set up the workspaces, strict tsconfigs, lint/format, Jest and Vitest with empty passing smoke tests, `.env.example` and the README skeleton. *Commit.*
2. **Contracts:** Zod schemas, `openapi.md`, `approvals.json` and `policy.md`, with tests for schema validation of the seed data. *Red then green commits.*
3. **Core logic, no LLM yet:** urgency ranking, retrieval, the greeting template and the teach fallback steps, all written test-first.
4. **LLM layer:** the `LlmClient` interface, Anthropic client, `withTimeout`, the unavailable client and the usage logger, test-first using a fake client.
5. **Endpoints, one at a time and test-first with Supertest:** greeting → summary (the NDJSON parser is the key piece) → help → chat. Add the validation middleware, rate limiter, error handler and SSE helper along the way.
6. **Frontend:** the store, the SSE client (test-first), then the panel UI. Component tests for the loading, streaming, error and fallback states.
7. **Polish and demo:** match the reference layout closely, check responsiveness, manually test with a real key, with **no key**, and with `FORCE_LLM_FAILURE=true`.
8. **README:** finish it (§9).

**Fallback plan if time runs short:** finish Summary, Help me and Replay Greeting fully, with tests and fallbacks. Have Talk to me and Teach me share the chat endpoint with lighter tests. Say this honestly in the README.

---

## 9. README.md (required content)

1. **Overview:** what the project is, with a screenshot or GIF of the panel.
2. **Setup:** Node version, `npm install`, copy `.env.example` to `.env`, add the API key, `npm run dev` (starts both apps), then open `http://localhost:3000`.
3. **Testing:** the commands, and what each test file proves.
4. **How to see the graceful degradation:** remove the API key, or set `FORCE_LLM_FAILURE=true`, or set `LLM_TIMEOUT_MS=1`, then try each action.
5. **Architecture:** a short diagram (UI → Zustand → SSE client → Express route → Zod → service → LlmClient → Claude) and the folder map.
6. **AI judgment note (150–250 words, written by Milan; Claude can draft it for him to edit).** It must cover:
   - **AI-necessary:** Talk to me and Teach me (open-ended language), and Help me (phrasing grounded answers).
   - **AI-optional:** Replay Greeting (a template already works; the LLM only improves the tone) and the Summary *ranking* (deterministic in code; the LLM only explains it).
   - **Fallback design:** the 8s timeout, first-token and idle timeouts, a fallback for each action, the UI never trusting raw text, and the help endpoint skipping the LLM when retrieval finds nothing relevant.
   - **One thing to do differently with more time:** for example a promptfoo eval suite, pgvector embeddings, a Redis-backed rate limiter and cache keyed by prompt hash, Pact contract tests, or Playwright E2E.
7. **Assumptions and challenged requirements:**
   - **Urgency:** it can't be derived from the given data, so a documented deterministic rule is used.
   - **Express over Next.js route handlers:** chosen so Supertest can test the API directly.
   - **Keyword retrieval instead of pgvector:** the brief allows this substitute.
   - **In-memory rate limiting:** acceptable for a take-home; production would use Redis.
   - **Structured output vs. streaming:** the summary streams validated NDJSON items.
   - **Deadline:** the email (24h) and the document (5 days) disagreed; note the deadline Milan worked to.
8. **AI tool usage:** be honest. For example: "Built with Claude Code from a plan I wrote. I reviewed every change, and I designed and adjusted X and Y myself." Milan fills this in truthfully.
9. **Prompt versioning:** where prompts live and how a version is bumped.

---

## 10. Definition of done

- [ ] `npm install && npm run dev` works from a fresh clone, following the README.
- [ ] All 5 actions work with a real key, and all 5 degrade gracefully with no key or a forced timeout. There is never a raw 500 or a frozen UI.
- [ ] Summary items and greetings are Zod-validated server-side, and SSE events are validated client-side.
- [ ] Prompts exist only in `/prompts/*.ts`, with versions.
- [ ] Rate limiting is in place and explained.
- [ ] Jest unit, Supertest integration and Vitest component tests all pass, and would catch a broken AI response shape or a silent LLM failure.
- [ ] The commit history shows red → green steps, with no squash.
- [ ] The README is complete, including the AI judgment note and assumptions.
