# Approvals AI Assistant

A working rebuild of the **"Approvals" assistant panel** from a digital-twin dashboard: a Next.js UI with a floating
assistant, backed by an Express API that calls Claude server-side. Every AI action has a deterministic, non-AI fallback,
so a missing API key or a slow model never breaks the UI.

> _Screenshot / GIF of the panel: added in phase 7._

## 1. Setup

Requirements: **Node 22+** (developed on Node 24) and npm 10+.

```bash
npm install
cp .env.example .env        # then set ANTHROPIC_API_KEY (optional: the app works without it, using fallbacks)
npm run dev                 # starts the API on :4000 and the web app on :3000
```

Open http://localhost:3000. The web app proxies `/api/*` to the API, so the browser never needs CORS or the key.

| Variable             | Default            | Purpose                                                                          |
| -------------------- | ------------------ | -------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`  | _(empty)_          | Server-side only. Empty means every action uses its fallback.                    |
| `ANTHROPIC_MODEL`    | `claude-haiku-5-5` | Fast and cheap; overridable.                                                     |
| `LLM_TIMEOUT_MS`     | `8000`             | Total timeout for non-streaming calls; first-token and idle timeout for streams. |
| `FORCE_LLM_FAILURE`  | `false`            | Demo switch that forces the fallback path.                                       |
| `RATE_LIMIT_PER_MIN` | `20`               | Per-session limit on `/api/ai/*`.                                                |
| `API_PORT`           | `4000`             | Express port.                                                                    |

## 2. Testing

```bash
npm test            # API (Jest + Supertest) then web (Vitest + Testing Library)
npm run test:api
npm run test:web
npm run coverage
npm run typecheck   # strict tsc across all workspaces
```

> _What each test file proves: filled in as the tests land._

## 3. Seeing the graceful degradation

> _Phase 7: remove the key, set `FORCE_LLM_FAILURE=true`, or set `LLM_TIMEOUT_MS=1`, then try each action._

## 4. Architecture

```
UI → Zustand store → SSE client → Express route → Zod validation → service → LlmClient → Claude
```

```
apps/
  web/            Next.js (App Router) + React + Tailwind + Zustand, tested with Vitest
  api/            Express + TypeScript, tested with Jest + Supertest
packages/
  contracts/      Zod schemas + inferred types shared by web and api (consumed as TS source, no build step)
data/
  approvals.json  seeded queue
  policy.md       approval policy note, the retrieval source for "Help me"
```

## 5. AI judgment note

> _Draft to come; written and edited by Milan._

## 6. Assumptions and challenged requirements

- **Express over Next.js route handlers:** the brief requires Supertest integration tests, and Supertest drives an
  Express app directly through an injectable `createApp({ llm, config })` factory.
- **TypeScript 6, not 7:** `ts-jest` supports TypeScript `<7`, so the repo pins 6.0.3.
- **Urgency can't be derived from the data.** All four items share a date and there is no priority field, so
  [`domain/urgency.ts`](apps/api/src/domain/urgency.ts) applies a documented, deterministic rule. A title goes in the
  first tier with a whole-word keyword match (simple plurals count):
  1. **Safety** (`high`): `safety`, `sensor`, `emergency`, `hazard`
  2. **Operational** (`medium`): `onboarding`, `checklist`, `patrol`
  3. **Reference** (`low`): `layout`, `map`, `demo`
  4. Anything else is `low` and goes last. Ties are broken by oldest `submittedAt`, then title, then id.

  For the seed this gives **a3 → a2 → a1 → a4**. The demo video (a2) ranks above the onboarding folder (a1) because
  "Patrol" puts it in the operational tier and the title tie-break ("Level…" < "Site…") decides. The model explains this
  order but never decides it.

- **Keyword retrieval instead of embeddings.** The policy has five sections, so term overlap plus a heading boost
  finds the right chunk and is easy to explain and test. The trade-off is no synonyms: "after a year" doesn't match the
  policy's "12 months". Embeddings (e.g. pgvector) would fix that.
- _In-memory rate limiting, streamed NDJSON summary, and the deadline: filled in as built._

## 7. AI tool usage

> _To be written by Milan._

## 8. Prompt versioning

> _Prompts live in `apps/api/src/prompts/*.v1.ts`; details added in phase 4/5._
