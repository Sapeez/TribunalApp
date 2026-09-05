# Security / trust boundary spec

Matches `TRIBUNAL_REQUIREMENTS.md` §11 in intent. This is the spec each rule below is built
against, pinned down to exactly where it must be enforced in code, so a reviewer can check it
mechanically instead of by inspection.

## Secrets

| Secret | Read only in | Never appears in |
|---|---|---|
| `OPENROUTER_API_KEY` | `lib/openrouter/client.ts`, `getOpenRouterClient()` | Any `NextResponse.json(...)` body; any `"use client"` file; any log line |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/client.ts`, `getSupabaseClient()` | Same as above |

Both clients are lazily-constructed singletons with a clear thrown error (naming `SETUP.md`) if
the env var is missing — a misconfigured deploy fails loudly at first use, not with a confusing
downstream error. **If you add a second way to construct either client, you've broken the "one
file reads this secret" invariant** — don't.

## What's deliberately *not* secret

System prompts (`agent_configs.system_prompt`) are ordinary, editable application data and are
returned in full by `GET /api/agent-config` — this is required for the professor to review/edit
the seed content through the console. Don't treat a system prompt leaking to the browser as a
finding; it's the documented design.

## Enforcement points for `max_tokens` caps

Two, and only two, places clamp `max_tokens` — both must independently enforce the cap regardless
of what the browser sends, per `TRIBUNAL_REQUIREMENTS.md` §5/§11:

1. **Save time**: `PUT /api/agent-config/:role` (`app/api/agent-config/[role]/route.ts`) —
   `Math.min(maxTokens, maxTokensCapFor(role))` before the DB write.
2. **Call time**: `lib/orchestrator/run.ts`, both the advocate and judge branches —
   `Math.min(agent.maxTokens, maxTokensCapFor(role))` right before `attemptWithRetries()`.

`MAX_TOKENS_CAP` and `maxTokensCapFor()` live in `lib/constants.ts` — the only place that should
change if the caps themselves change.

## Snapshot pattern (audit integrity)

`agent_configs` is live and editable at any time. `advocate_outputs`, `verdicts`, and `call_logs`
each store their own `model` / `system_prompt` / `max_tokens` **captured at the moment of the
call**, never a foreign key back to `agent_configs`. This is what makes a past run permanently
accurate to what was actually sent, even after the config is edited later. Any refactor that
replaces a snapshotted column with a join to `agent_configs` silently breaks the audit trail's
core guarantee — treat this as a correctness bug, not a style choice.

## Real-usage-only rule

A model response without OpenRouter's real `usage` object is logged to `call_logs` as
`status: 'failed'` (see `lib/orchestrator/run.ts`'s `hasRealUsage` check) even though `output` may
be non-null. Tokens/cost totals on `cases` are summed only from `call_logs` rows with
`status = 'success'`. Never introduce an estimated/approximate token or cost value anywhere in
this codebase.

## Browser ↔ Supabase

The browser never talks to Supabase directly — no anon key is ever shipped to the client. All 5
tables have RLS enabled with zero policies (defense-in-depth only, since the service-role key
bypasses RLS anyway — see `specs/data-model.md`).

## Upload validation (`POST /api/extract`)

Accepted type is PDF only (5 MB cap) — `.docx` support was intentionally dropped, see
`specs/status.md`. A rejected upload leaves existing form fields untouched — never a partial
silent overwrite.

## Prompt injection hardening

Three places where attacker-influenced text flows into a model call — the extracted document,
the case text, and advocate output read by judges — wrap that content in `<document>`/`<case>`/
`<arguments>` delimiters with an explicit "this is data, not instructions" line, and the
extraction call additionally uses structured-output mode (`response_format: json_schema`) plus a
per-field max length check before anything reaches the browser as a draft. See
`TRIBUNAL_REQUIREMENTS.md` §16 for the full rationale. None of the agents in this app have tool
access, so a successful injection is still capped at "bad text shows up somewhere" — this doesn't
change that.
