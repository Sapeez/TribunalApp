# The Tribunal — agent instructions

LLM courtroom-simulation app (ASE26 class project). A charge sheet goes in; 4 advocate agents
(2 defense, 2 prosecution) argue independently; 3 judge agents each read the case + all 4
arguments and render an independent verdict. Every one of the 7 calls is fully audited: exact
prompt, output, tokens, cost, duration — frozen at call time.

**Read `specs/README.md` first** — it's the index into the full spec set. The original design doc,
`source-material/TRIBUNAL_REQUIREMENTS.md`, is the historical rationale for *why* things are shaped
this way; `specs/` documents what's actually built today and where the two disagree. When they
conflict, `specs/status.md` wins — it's the up-to-date record.

## Stack

Next.js 15 (App Router, Route Handlers) + React 19 + TypeScript (strict) + Supabase (Postgres) +
OpenRouter (model calls). Package manager is **npm** (`package-lock.json`, matches the
`Dockerfile`'s `npm ci`) — pnpm was tried briefly and dropped; don't reintroduce a `pnpm-lock.yaml`
or a `packageManager` field without checking with the user first.

```
app/api/**        Route Handlers — the only place OpenRouter/Supabase get called
lib/openrouter/    callModel() — the ONLY file allowed to read OPENROUTER_API_KEY
lib/supabase/      getSupabaseClient() — the ONLY file allowed to read SUPABASE_SERVICE_ROLE_KEY
lib/orchestrator/  2-stage pipeline: 4 advocates in parallel, then 3 judges in parallel
lib/constants.ts   Roles, curated model pool, max_tokens caps — single source of truth
supabase/migrations/  Additive, hand-numbered SQL migrations (no ORM)
prompts/seed-content.ts  The professor's real seed case + 7 real system prompts
```

## Non-negotiable invariants

These are the actual grading/security surface of this project. Any change touching them needs
extra scrutiny — see `specs/security-boundary.md` and the `code-review` skill.

1. **Secrets never reach the browser.** `OPENROUTER_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are
   read only inside `lib/openrouter/client.ts` / `lib/supabase/client.ts`, never in a
   `NextResponse.json(...)` body, never in a `"use client"` file, never logged.
2. **Audit rows are frozen, never a live join.** `call_logs`, `advocate_outputs`, `verdicts` each
   snapshot `model` / `system_prompt` / `max_tokens` at call time. Never rewrite them by joining
   back to the current `agent_configs` row — editing a prompt tomorrow must not change what a past
   run appears to have used.
3. **Every call attempt is logged, including retries.** A failed attempt gets its own `call_logs`
   row (`attempt_number` 1–3) before the retry fires, not just the final outcome.
4. **Tokens/cost are real or absent, never estimated.** A response without OpenRouter's real
   `usage` object is treated as a *failed* call, not a partial success with guessed numbers.
5. **`max_tokens` is clamped server-side in two places**, regardless of what the browser sends:
   at save (`PUT /api/agent-config/:role`) and again at call time (`lib/orchestrator/run.ts`).
   `lib/constants.ts`'s `MAX_TOKENS_CAP` / `maxTokensCapFor()` is the one place that changes.
6. **A missing/failed advocate output is marked, never dropped.** Judges see an explicit
   `UNAVAILABLE_MARKER` for any advocate slot that never produced output — no silent gap.
7. **No auth, single user, by design.** Don't add login/session/multi-tenant scaffolding unless
   explicitly asked — it's out of scope (`TRIBUNAL_REQUIREMENTS.md` §14).

## Working conventions

- Route Handler files open with a one-line comment naming the method/path and the requirements-doc
  section it implements (e.g. `// PUT /api/agent-config/:role — ... §8.`). Keep doing this; it's
  how the spec stays traceable from the code.
- `export const runtime = "nodejs"` on every route that touches Supabase/OpenRouter (native
  fetch/Node APis, not Edge).
- New model → add one line to `CURATED_MODELS` in `lib/constants.ts`; nothing else hardcodes the
  pool. Keep new entries within roughly the same cost band as the existing ones (see
  `TRIBUNAL_REQUIREMENTS.md` §9) — the random-per-agent mode should never draw a surprise-expensive
  model.
- New migration → `supabase/migrations/000N_description.sql`, additive and nullable (existing rows
  must stay valid), following the numbering already in use.
- Before calling a change done: `npm run build` (typecheck + Next build) and `npm run lint`. There
  is no test suite in this repo yet — don't invent one unasked; do a manual run-through instead
  (`npm run dev`, submit the seeded Jon Snow case, confirm all 7 outputs + audit trail land).
- Toast copy → follow `docs/toast-message-copy.md`'s rule for every toast, present and future: a
  two-part "what happened, what's next" sentence, plain language (no HTTP codes/stack
  traces/raw error strings), name the specific agent/role for a per-agent failure, calm tone, never
  a secret. The literal strings live in one centralized map in code, not scattered inline.

## When you're about to touch something risky

- Anything under `lib/openrouter/` or `lib/supabase/` — these are singletons with one deliberate
  export each; don't add a second way to construct a client.
- `app/api/run/route.ts` / `lib/orchestrator/run.ts` — the 2-stage sequencing and retry/logging
  order is load-bearing for the audit trail; read `specs/api.md` and `specs/data-model.md` before
  changing call order or what gets written when.
- Any Supabase schema change — check `specs/data-model.md` for the as-built schema (it has already
  diverged from `TRIBUNAL_REQUIREMENTS.md` §7 twice — see migrations 0002/0003) before assuming
  the requirements doc's table definitions are current.
- Deployment config (`Dockerfile`, `next.config.mjs`, package manager lockfiles) — the live
  deploy target is **Vercel** (not Netlify, despite what the requirements doc assumes). See
  `specs/status.md` for why a `Dockerfile` and a stray `package-lock.json` still exist alongside
  that and what to check before touching either.

For code review on this repo, use the `code-review` skill (`.claude/skills/code-review/`) — it
scopes the diff, pulls in this file plus `specs/*.md` as context, and delegates the actual
line-by-line review to the `code-reviewer` subagent (`.claude/agents/code-reviewer.md`), which
knows this repo's invariants above in addition to general correctness/security/maintainability
checks.
