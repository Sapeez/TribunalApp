# API — as built

All routes live under `app/api/**`, run on `runtime = "nodejs"` (not Edge — they need real Node
APIs and the Supabase/OpenRouter server SDKs), and are the *only* code path that talks to Supabase
or OpenRouter. This supersedes `TRIBUNAL_REQUIREMENTS.md` §8, which lists 6 routes at a coarser
grain than what's implemented (two are split into dynamic `:id`/`:role` routes).

| Method & path | File | Notes |
|---|---|---|
| `GET /api/agent-config` | `app/api/agent-config/route.ts` | All 7 roles' current config, ordered by role. |
| `PUT /api/agent-config/:role` | `app/api/agent-config/[role]/route.ts` | Validates `model`/`systemPrompt`/`maxTokens`; clamps `maxTokens` to `maxTokensCapFor(role)` **regardless of what's sent** — this is one of the two enforcement points in invariant §5 of `CLAUDE.md`. |
| `GET /api/models` | `app/api/models/route.ts` | Returns `CURATED_MODELS` + `DEFAULT_MODEL` from `lib/constants.ts`. The browser never hardcodes this list. |
| `POST /api/run` | `app/api/run/route.ts` | Body: `{ caseText, agents: RunAgentInput[] }`. Validates all roles are known, all 7 agents have a non-empty `name`, and all 4 advocates have a non-empty `systemPrompt` (a judge with an empty prompt is silently excluded from that run; an empty advocate prompt blocks Run entirely — §4.1). Creates the `cases` row, then kicks off `runCase()` via `after()` so the pipeline keeps running past the response — works in both `next dev` and Vercel's serverless runtime. Returns the case id immediately; **does not block on the run finishing** (§13.1 resolved: polling, not a blocking request). |
| `GET /api/cases` | `app/api/cases/route.ts` | Past-runs list, most recent first, **terminal statuses only** (`complete`/`partial-failure`/`failed` — an in-progress `running` case never shows here). Paginated via `?limit=&offset=` (default 10, max 100), `hasMore` computed by fetching one extra row. |
| `GET /api/cases/:id` | `app/api/cases/[id]/route.ts` | Full detail: the case row, all `advocate_outputs`, all `verdicts`, each annotated with a `duration_ms` summed across every `call_logs` attempt for that role. **This is also the polling endpoint** while a run is still `running` — the browser calls it repeatedly until status is terminal (§13.1). |
| `POST /api/extract` | `app/api/extract/route.ts` | Body: `multipart/form-data` with a `file`. **PDF only** — `.docx` support (originally described in the requirements doc §4.0) was intentionally dropped; the `mammoth` dependency has been removed, see `specs/status.md`. Runs one `call_type: 'extraction'` LLM call (`openai/gpt-4o-mini`, fixed, not user-selectable), logs it to `call_logs` with `case_id: null`, and returns 15 draft fields (8 content fields + 7 name fields) for the browser to pre-fill. **Never saves anything itself.** Requires all 8 original content fields to be non-empty to count as a usable result (422 otherwise, listing which fields came back empty); the 7 name fields are best-effort and don't block success. |

## Request/response conventions worth preserving

- Every route returns `{ error: string }` with a non-2xx status on failure — never a bare string,
  never swallowed silently.
- `agents` sent to `POST /api/run` are the browser's **current, possibly-unsaved** field values —
  an unsaved edit still takes effect for that run, matching the reference app's behavior noted in
  the requirements doc. Don't "fix" this into requiring a save first without checking with the user.
- Dynamic route params are `Promise<{ role: string }>` / `Promise<{ id: string }>` (Next.js 15
  App Router convention) — always `await params` before using it.
- Nothing in any response body ever includes `OPENROUTER_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` —
  see `specs/security-boundary.md`.
