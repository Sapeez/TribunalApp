# Best practices

Coding conventions distilled from the codebase as it exists today, not aspirational rules. Follow
the pattern already in the file you're editing over anything below if they conflict — this doc
should get updated to match, not the other way around.

## Route Handlers (`app/api/**`)

- Open every route file with a one-line comment: method + path + one-sentence purpose + the
  requirements-doc section it implements, e.g. `// PUT /api/agent-config/:role — ... §8.` This is
  the traceability link from code back to spec; keep it even after `specs/` exists, since it's
  the fastest way to find *why* a route behaves a certain way while reading the code itself.
- `export const runtime = "nodejs";` on every route that touches Supabase or OpenRouter.
- Dynamic segments: `{ params }: { params: Promise<{ role: string }> }`, then `await params` —
  Next.js 15 convention, not optional.
- Validate input shape before touching the DB or calling a model; return
  `NextResponse.json({ error: "..." }, { status: 400 })` for bad input, never throw past the
  handler boundary.
- A route that can partially fail (e.g. `POST /api/extract`) should say exactly what succeeded and
  what didn't in the error body (see its `emptyFields` field) rather than a single opaque message.

## Server/client boundary

- `lib/openrouter/` and `lib/supabase/` are server-only. Never import either from a file marked
  `"use client"` — there's currently no lint rule enforcing this, so it's a manual discipline, not
  a compiler guarantee. If you're touching build tooling, adding an ESLint rule that fails on this
  import path from client components would be a genuine improvement (ask before adding new lint
  infra, though — it's a scope decision).
- Both `getOpenRouterClient()` and `getSupabaseClient()` are lazy singletons (`let client = null`
  at module scope, construct-once). Don't add a second constructor path for either; if you need a
  different config (e.g. a test double), thread it through the existing function's signature
  instead of bypassing it.

## The audit-trail pattern

This is the one pattern worth understanding before touching `lib/orchestrator/run.ts`:

1. **Log every attempt, not just the outcome.** `attemptWithRetries()` writes a `call_logs` row
   inside the retry loop, after every attempt (success or failure), before deciding whether to
   retry. Never collapse this into "log once after all retries" — the point of the audit trail is
   seeing every attempt.
2. **Snapshot, never join.** Every row that represents a call result carries its own
   `model`/`system_prompt`/`max_tokens`, copied at call time from the `RunAgentInput` the browser
   sent for that run — never re-read from `agent_configs`. See `specs/security-boundary.md`.
3. **A call without real `usage` data is a failure**, even if it produced text. Don't change this
   to "trust the output, null out the cost" — a partially-trusted number is explicitly worse than
   an honest failure per the requirements doc's §5.
4. **Status is derived from final per-role state, not raw `call_logs` rows.** A role that failed
   twice then succeeded has both a `failed` and a `success` row in `call_logs` for the same role —
   compute `cases.status` from `advocate_outputs.failed`/`verdicts.failed` (the final per-role
   outcome), not by scanning `call_logs` directly.

## Adding things

- **New curated model**: one line in `CURATED_MODELS` (`lib/constants.ts`). Keep it within roughly
  a 10× cost band of the existing pool so "random per agent" mode can't produce a surprise-
  expensive run (§9's own reasoning).
- **New migration**: `supabase/migrations/000N_description.sql`, additive (`ADD COLUMN IF NOT
  EXISTS`) and nullable, so existing rows stay valid without a backfill. Follow the header-comment
  style already in `0002`/`0003` (what each column is for, and why it's nullable).
- **New role or call type**: touch `lib/constants.ts` first (`AgentRole`, `ADVOCATE_ROLES` /
  `JUDGE_ROLES` / `ALL_ROLES`) — everything else (orchestrator, routes, UI) derives from those
  arrays rather than hardcoding role lists.

## Error handling style

- Never swallow a Supabase or OpenRouter error silently. Log it (`console.error` with enough
  context to find the row: case id, role) and propagate a real error — see `runCase()`'s upsert
  error handling, which throws with the role and case id in the message rather than continuing
  with a half-written state.
- User-facing error messages from `/api/extract` and `/api/run` should be specific enough for the
  professor (a non-engineer) to know what to do next ("Only .pdf files are accepted", not
  "Invalid input").

## What not to add without asking

- A test suite (none exists; the requirements doc's "definition of done" is an end-to-end manual
  run-through, not automated tests — see `specs/README.md`).
- Auth, sessions, or multi-tenancy (explicitly out of scope).
- Prompt caching (explicitly deferred past v1 in the requirements doc §14).
- A design system or component library for the Console UI (intentionally plain/functional, §10).
