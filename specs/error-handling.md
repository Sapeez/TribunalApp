# Error handling & race conditions — as built

Supersedes `TRIBUNAL_REQUIREMENTS.md` §10.1's error-states list with the actual classification
table and the race-condition audit that came with it.

## Failure-mode classification

Classification and copy are two separate, single-purpose files, per `docs/toast-message-copy.md`'s
"decided separately from the failure-detection/classification logic" split:

- `lib/openrouter/errors.ts` decides, for every OpenRouter call failure, only *whether retrying can
  help* — `classifyError()`/`classifyNoUsage()`/`classifyEmptyContent()` return `{code, retryable,
  detail}` and nothing else. `detail` is the raw exception text, server-side only.
- `lib/toastMessages.ts` is the single centralized copy map — *what the human sees* — for this
  classification and every other failure mode in the app (Supabase-unreachable, run-already-active,
  upload/extraction failures). It has zero server-only dependencies (no `openai`, no Supabase) so
  it's safe to import from both server code and `"use client"` code. `ErrorCode` is defined there;
  `lib/openrouter/errors.ts` imports it, not the other way around.

`lib/orchestrator/run.ts`'s `attemptWithRetries` is the only place that combines the two: it calls
`classifyError()`/etc. for the retry decision, then `agentRetryMessage()`/`agentFailureMessage()`
(both role-labeled — see `roleLabelFor()`) for the copy actually stored/toasted.

| Cause | Code | Retryable? | User-facing message (retrying / exhausted) |
|---|---|---|---|
| Network unreachable / connection timeout | `network` | yes | "\[Role\]'s request didn't go through — retrying." / "\[Role\] failed after 3 attempts — the model provider may be down. You can re-run the case once it's back." |
| 401/403 — invalid or revoked key | `auth` | **no** — fails fast on attempt 1 | "The connection to the model provider isn't set up correctly — this needs to be fixed in the app's settings, not by re-running." (no role prefix — a global config issue, not this agent's fault) |
| 429 — rate limited | `rate_limit` | yes | "\[Role\] hit a rate limit — retrying shortly." / same exhausted message as `network`/`provider_down` |
| 5xx — provider/model down | `provider_down` | yes | "\[Role\] couldn't reach the model provider — retrying automatically (attempt N of 3)." / same exhausted message |
| 400 — bad request (e.g. `max_tokens` rejected by the model's own context window) | `bad_request` | **no** — a config problem, not transient | "\[Role\]'s configuration was rejected by the model provider — check its model/max-tokens settings." |
| 200 response, no real `usage` object (§5) | `no_usage` | yes | "\[Role\] hit an issue — retrying (attempt N of 3)." / "\[Role\] couldn't complete after 3 attempts. Check the audit log for this call, or try running again." |
| 200 response, empty `choices[0].message.content` (a provider erroring inside a 200 body) | `empty_content` | yes | same generic phrasing as `no_usage` |
| Anything unclassified (defensive fallback) | `unknown` | yes | same generic phrasing as `no_usage` |

Note: `max_tokens` exceeding **our own** server-side cap (`lib/constants.ts`'s `MAX_TOKENS_CAP`) is
not in this table because it can't reach a call at all — it's clamped before `attemptWithRetries`
is ever invoked (`Math.min(agent.maxTokens, maxTokensCapFor(role))` in `lib/orchestrator/run.ts`).
`bad_request` above covers a different case: the model's *own* context window rejecting a
(post-clamp) request OpenRouter itself considers malformed.

The role-labeled message is what lands in `advocate_outputs.error_message` /
`verdicts.error_message` — the fields `GET /api/cases/:id` returns to the browser, and (verbatim)
what a per-role failure toast shows (`app/page.tsx`'s `pollRun`). The raw exception
(`classifyError()`'s `detail`) only ever goes into `call_logs.error_message` (never returned to the
browser — confirmed by reading `app/api/cases/[id]/route.ts`, which selects
`role, duration_ms, attempt_number, error_code` from `call_logs`, never `error_message`) or a
server-side `console.error`. Same split applies to `POST /api/run`'s Supabase-unreachable response
and `POST /api/extract`'s failure responses — see `docs/toast-message-copy.md` for the full copy
rule and the rest of the centralized map (uploads, run-already-active, write-failed).

## Retry timing

- Backoff before a retry attempt: `500ms * 2^(attempt-1) + jitter(0-250ms)`, capped at 4000ms — none
  before attempt 1. The actual delay is written to `call_logs.retry_delay_ms` (migration `0004`) so
  retry timing is auditable, not just the outcome.
- A non-retryable classification (`auth`, `bad_request`) stops the loop immediately instead of
  burning the remaining attempts — those attempts were never going to succeed.
- The retry `for` loop in `attemptWithRetries` `await`s each attempt sequentially; there is no
  `Promise.all` across attempts for one role. Parallelism stays where §4.1 intends it: across the
  4 advocates within stage 1, and across the 3 judges within stage 2 — never within one role's
  retry chain.

## Write resilience

Two gaps existed before this pass, both in `lib/orchestrator/run.ts`:

1. **`call_logs` inserts were unchecked.** If the OpenRouter call succeeded but the write failed,
   that attempt (and its cost) vanished with no audit row at all. Fixed: every `call_logs` insert
   and every `advocate_outputs`/`verdicts` upsert now goes through `retryWrite()` — up to 3 attempts,
   300ms apart. If all 3 fail, the row is dead-lettered via `console.error` (full row content) —
   not silently lost, though it genuinely can't be persisted if Supabase is down.
2. **A DB-write failure on one role aborted the whole run.** The `advocate_outputs`/`verdicts`
   upsert used to `throw` on error, which rejected the surrounding `Promise.all` and made `runCase`
   itself throw — `app/api/run/route.ts`'s catch then marked the **entire case** `failed`, skipping
   stage 2 even if 3 of 4 advocates had already succeeded. Fixed by routing the upsert through
   `retryWrite()` too, which never throws — one role's persistent DB blip no longer cancels the
   other 6 calls. `runCase`'s final status derivation also now treats a completely empty
   `advocate_outputs`/`verdicts` result set (every write dead-lettered) as `failed` rather than
   vacuously `complete`.

## Live "retrying" visibility

`advocate_outputs`/`verdicts` rows are only written once a role's full retry chain settles, so a
poll mid-retry previously saw nothing for that role. `GET /api/cases/:id` now also returns
`retrying: Record<AgentRole, { attempt, maxAttempts, code }>` — computed from the highest
`attempt_number`/`error_code` logged in `call_logs` (migrations `0004`/`0005`) for a role that has
no final row yet while the case is still `running`. `app/page.tsx`'s `roleStatus()` (previously
computed but never rendered — dead code) is now wired into each agent card as a `status-${status}`
class + badge, with a `retrying` state distinct from `running`. A `failed` badge is a hover/click
target (reusing the existing `.info-tooltip-anchor`/`.info-tooltip-text` pattern) showing the
classified reason above.

The same `retrying`/failed transitions also drive live toasts: `pollRun`'s poll loop diffs each
role's derived status tick-over-tick (`prevRoleStatusRef`) and fires a one-shot toast the moment a
role enters `retrying` (via `agentRetryMessage()`, using the `code` from the poll response) or
`failed` (using that role's already-composed `error_message`) — not on every 1.5s tick. See
`docs/toast-message-copy.md` for the copy rule this follows.

**Known gap, not yet closed:** if the model call succeeds but the `advocate_outputs`/`verdicts`
write is dead-lettered (every retry of the write itself fails — Supabase down specifically for
writes), that role never gets a row at all, so neither the per-role toast nor the card badge can
reflect it — the card just reads `excluded` once the run ends, indistinguishable from "this role
was never run." `lib/toastMessages.ts`'s `writeFailedMessage()` exists for this case but isn't
wired to a live signal yet; closing this needs the API to expose *which* roles were dead-lettered
(their call_logs attempts show a success status with no matching final row), not just their
absence. `app/page.tsx` does at least fall back to a generic "this run failed and nothing could be
saved" toast for the degenerate case where *every* role in a `failed` run was dead-lettered.

## Race conditions audited

| Scenario | Finding | Fix / why none was needed |
|---|---|---|
| Double-click/double-submit on Run | `POST /api/run` always `insert`s a **new** `cases` row — it never reuses a case id, so two rapid clicks can't race on the same `(case_id, role)` unique constraint; they'd just start two independent, fully-costed runs. | Hardened `handleRun` (`app/page.tsx`) with a synchronous `isSubmittingRef` on top of the existing `disabled={!canRun \|\| running}` guard, as belt-and-suspenders against a scripted/rapid-fire click that outruns React's render commit. |
| Retry attempt 2 firing before attempt 1 resolves | Not found — the `for` loop in `attemptWithRetries` already `await`s each attempt. | No fix needed; added backoff between attempts as a new feature (see above), not a bug fix. |
| Concurrent "Single model" apply (`handleSingleModelChange`) | Real bug: each dropdown change fires 7 concurrent `PUT /api/agent-config/:role` calls with no in-flight guard; a second rapid change's responses could interleave with the first's and a stale response could clobber the newer selection. | Added a monotonic `modelApplyRef` counter; a batch's `setDrafts` calls are now skipped if a newer batch has started since. |
| `GET /api/cases/:id` polling vs. the background run's writes | Not found — `runCase` updates `cases.status` to a terminal value strictly *after* both `Promise.all` stages (and their upserts) resolve, so a poll can never observe a terminal status with an incomplete `advocate_outputs`/`verdicts` row for that run. Mid-run, a role simply has no row yet, which the frontend already treats as pending/running, not an error. | No fix needed; documented here as the reasoning that makes it safe. |

## Adding a new failure mode

Two files, each with one job:
1. `lib/openrouter/errors.ts` — add a branch to `classifyError()` (or a new `classify*()` function
   for a non-thrown-exception case like `no_usage`/`empty_content`) deciding the code and whether
   it's retryable.
2. `lib/toastMessages.ts` — add that code's copy to `agentRetryMessage()`/`agentFailureMessage()`,
   following `docs/toast-message-copy.md`'s rule.

Nothing else needs to change — `attemptWithRetries` already routes every attempt through both.
