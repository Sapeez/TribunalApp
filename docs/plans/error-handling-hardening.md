# Error-handling & race-condition hardening — implementation plan

**Status:** Executed. `lib/openrouter/errors.ts`, migration `0004_add_retry_delay_to_call_logs.sql`,
and the `retrying` field in `app/api/cases/[id]/route.ts` all match this plan. `specs/error-handling.md`
is the resulting as-built record — read that for current behavior; this file is kept for the
original reasoning/race-condition audit. (Moved here from the repo root 2026-09-05 to sit
alongside its sibling plan, `advocates-judges-avatar-list.md`.)

## Context

The Tribunal's backend (`lib/orchestrator/run.ts`, `lib/openrouter/client.ts`) currently treats every
call failure identically: retry 3x, log `err.message` verbatim, no backoff. Auditing it against
`TRIBUNAL_REQUIREMENTS.md` §4.1/§5/§10.1/§11 and the actual code turned up concrete gaps:

1. **No error classification.** A 401 (bad key) burns the same 3 retries as a 429 or a network
   blip, wasting attempts on something retrying can never fix.
2. **Unsanitized error messages reach the browser.** `attemptWithRetries` stores raw `err.message`
   into `advocate_outputs.error_message` / `verdicts.error_message`, which `GET /api/cases/:id`
   returns and `app/page.tsx` renders verbatim (`AgentOutputPreview`, `ResultsModal`). Not a secret
   leak today, but not the sanitized, classified message §11's spirit calls for either.
3. **Silent write loss.** `call_logs` inserts in `run.ts` never check `{ error }` — if the OpenRouter
   call succeeded but the Supabase write fails, that attempt (and its cost) vanishes with no audit
   row and nothing in the logs.
4. **One role's DB hiccup kills the whole run.** The `advocate_outputs`/`verdicts` upsert *does*
   check its error, but reacts by `throw`-ing inside a `Promise.all` callback — that rejects the
   whole stage, `runCase` throws, and `app/api/run/route.ts`'s catch marks the **entire case**
   `failed`, skipping stage 2 (judges) even if 3 of 4 advocates succeeded. A transient DB blip on
   one role shouldn't cancel the other 6 calls.
5. **No backoff between retries.** Attempt 2 fires immediately after attempt 1 fails.
6. **No live "retrying" visibility.** `advocate_outputs`/`verdicts` rows are only written once
   `attemptWithRetries` fully resolves (success or exhausted) — so a poll mid-retry sees nothing
   for that role. There's already a `roleStatus()` function and an `AgentOutputPreview` component in
   `app/page.tsx` that compute/would show per-role status, but **neither is actually wired into the
   rendered JSX** (dead code) — and even if they were, there's no attempt-count data to show
   "retrying 2/3".
7. **`handleSingleModelChange` (app/page.tsx) has no in-flight guard.** It fires 7 concurrent
   `PUT /api/agent-config/:role` calls; a second rapid dropdown change starts 7 more before the
   first batch's `setDrafts` responses land, so responses can interleave and a stale response can
   clobber a newer selection.

Two things I checked and found **already correct** (documenting, not fixing):
- The retry `for` loop in `attemptWithRetries` already `await`s each attempt sequentially — no
  overlapping attempts for one role.
- `POST /api/run` always `insert`s a **new** `cases` row per call (never re-uses a case id), so a
  double-click can't produce two writes racing on the same `(case_id, role)` — it would just start
  two independent, fully-costed runs. The existing `disabled={!canRun || running}` + synchronous
  `setRunning(true)` at the top of `handleRun` already prevents that in the normal click case; I'm
  hardening it with a synchronous ref as belt-and-suspenders against a scripted/rapid-fire edge case,
  not because I found it failing.
- The final `cases.status` update in `runCase` happens strictly after both `Promise.all` stages
  (and their upserts) resolve — so polling can never observe a terminal `status` with an
  incomplete `advocate_outputs`/`verdicts` row for that run.

## Approach

### 1. New file: `lib/openrouter/errors.ts`

A single classification module — the "one place to review and extend" the task asked for.

```ts
export type ErrorCode =
  | "auth" | "rate_limit" | "provider_down" | "network" | "bad_request"
  | "no_usage" | "empty_content" | "unknown";

export interface ClassifiedError {
  code: ErrorCode;
  retryable: boolean;
  detail: string;        // raw message, server-log/call_logs only, never sent to the browser
  userMessage: (ctx: { attempt: number; maxAttempts: number; exhausted: boolean }) => string;
}

export function classifyError(err: unknown): ClassifiedError
```

- Inspects the OpenAI-SDK error shape (`err.status`/`err.code`, `APIConnectionTimeoutError`, etc.)
  to bucket: 401/403 → `auth` (not retryable), 429 → `rate_limit` (retryable), 5xx → `provider_down`
  (retryable), connection/timeout → `network` (retryable), 400 → `bad_request` (not retryable —
  e.g. `max_tokens` rejected by the model's own context window, a config problem, not transient).
- Two more codes for outcomes that aren't thrown exceptions but are classified the same way for
  message/retry consistency: `no_usage` (§5 — 200 but missing `usage`) and `empty_content` (200,
  empty `choices[0].message.content`) — both retryable, since a retry may well get a clean response.
- `userMessage()` returns the exact copy style from the task brief, e.g. `provider_down` +
  `!exhausted` → *"OpenRouter is currently unavailable — this call will retry automatically."*;
  `provider_down` + `exhausted` → *"OpenRouter is down — this agent's call failed after 3 attempts.
  Try running again in a few minutes."*; `auth` → *"The OpenRouter API key is invalid or missing —
  this needs to be fixed in the deployment config."* (never the key/value); `rate_limit` →
  *"Rate limited by OpenRouter — retrying with backoff."* / exhausted variant.
- `detail` carries the real `err.message` for `call_logs.error_message` (server-side audit only,
  `GET /api/cases/:id` never returns `call_logs` rows to the browser — confirmed by reading that
  route). `userMessage()`'s output is what goes into `advocate_outputs.error_message` /
  `verdicts.error_message` (which *are* returned to the browser) — sanitized by construction, no
  raw exception text ever reaches a response body.

### 2. `lib/orchestrator/run.ts` — retry loop + write-resilience

- In `attemptWithRetries`: on catch, `classifyError(err)`. If `!retryable`, stop looping
  immediately (don't burn the remaining attempts) and record the classified `userMessage` in the
  final outcome. If retryable and attempts remain, sleep `backoffDelay(attempt)` before the next
  loop iteration: `500 * 2**(attempt-1) + jitter(0-250ms)`, capped at 4000ms.
- Same classification applied to the existing `no_usage` branch (currently a hardcoded string) so
  its message/retryability go through the same table.
- Add a `retryWrite(fn, label)` helper: retries a Supabase write up to 3x with a short fixed delay
  (e.g. 300ms), and on final failure `console.error`s a full dead-letter dump (row content + label)
  instead of throwing. Wrap the `call_logs` insert in it (fixes gap #3).
- Change the `advocate_outputs`/`verdicts` upsert: use `retryWrite` instead of `throw`ing on
  failure. If it still fails after retries, treat that role as `failed` with a DB-write-specific
  message (distinct from a model-call failure) and continue — don't let it reject the surrounding
  `Promise.all` (fixes gap #4). This keeps `runCase` from aborting stage 2 over one role's DB blip.
- Add `attempt_number`'s sibling `retry_delay_ms` to the `call_logs` insert (the delay waited
  *before* this attempt; 0 for attempt 1) so retry timing is auditable (per the task's ask).

### 3. Migration `supabase/migrations/0004_add_retry_delay_to_call_logs.sql`

Additive/nullable, matching repo convention:
```sql
alter table call_logs add column if not exists retry_delay_ms integer;
```
(Only `call_logs` needs a new column — `advocate_outputs`/`verdicts.error_message` just start
holding the sanitized string instead of the raw one; no schema change needed there.)

### 4. `app/api/cases/[id]/route.ts` — expose in-progress retry state

Currently selects `role, duration_ms` from `call_logs`. Extend the select to include
`attempt_number` and compute, per role that has **no** final `advocate_outputs`/`verdicts` row yet
while `case.status === 'running'`, the highest `attempt_number` logged so far. Return this as
`retrying: Record<AgentRole, { attempt: number; maxAttempts: number }>` alongside the existing
fields. (`MAX_ATTEMPTS_PER_CALL` from `lib/constants.ts`.)

### 5. `app/api/run/route.ts` and `app/api/extract/route.ts` — sanitize remaining raw messages

- `POST /api/run`'s Supabase-unreachable branch: replace `error?.message` in the response body with
  a fixed sanitized string — *"Can't reach the database right now — no run was started, so no cost
  was incurred."* (matches §10.1's own framing; log the real `error.message` server-side via
  `console.error` only).
- `POST /api/extract`'s two raw-`err.message` spots (`pdf-parse` failure, top-level catch): run
  through `classifyError` for the model-call catch (network/5xx/auth/etc.), keep the existing
  specific 422 messages (already fine — those describe *what* was missing, not an exception).

### 6. `app/page.tsx` — wire up live status + harden the two races

- **Wire `roleStatus()` and the new `retrying` field into `renderAgentCard`**: add a status class
  (`agent-card-frame ${stance} ${status}`) and a small badge reusing the existing `.status-badge`
  classes/CSS vars (`--status-idle/running/done/failed/partial`, `app/globals.css:13-17`). Add one
  new `--status-retrying` token + `.status-badge.retrying` rule for the "retrying (attempt N/3)"
  state, distinct from the plain "running" color.
- Make the failed badge show its `error_message` (already sanitized per #2/#5) on hover/click —
  reuse the existing `.info-tooltip-anchor`/`.info-tooltip-text` pattern already in the file
  (`app/page.tsx:1149-1160`) rather than inventing a new tooltip mechanism.
- `AgentOutputPreview` is already fine as-is for showing final output/error — no change needed
  beyond confirming it's reachable (it currently isn't rendered anywhere; leave it removed/unused
  since the new inline badge+tooltip covers the "failed reason" requirement more directly — **will
  delete the dead component** rather than wire up a second, redundant place to show the same info).
- **`handleRun` hardening**: add `const isSubmittingRef = useRef(false)`; check-and-set it
  synchronously as the very first line, reset it in the existing `finally`-equivalent paths
  (catch block and the terminal branch of `pollRun`'s `tick`). Belt-and-suspenders on top of the
  existing `disabled={!canRun || running}` guard.
- **`handleSingleModelChange` hardening**: add a `modelApplyRef` (monotonic counter). Capture
  `const requestId = ++modelApplyRef.current` at the top; after the `Promise.all` resolves, only
  apply the `setDrafts` results if `requestId === modelApplyRef.current` (i.e. no newer call
  started meanwhile) — stale-response guard instead of a hard "ignore clicks while in flight" lock,
  since the requirement is about not letting stale writes clobber the current selection, not about
  blocking the UI.

### 7. Docs — `specs/error-handling.md` (new) + one-line pointers

Per `CLAUDE.md`/`specs/README.md`: `specs/` is the up-to-date record, `TRIBUNAL_REQUIREMENTS.md` is
frozen historical rationale. New `specs/error-handling.md` will hold:
- The failure-mode → code → retryable? → message table (mirrors `lib/openrouter/errors.ts`).
- The race conditions audited above: which were real bugs and how they're fixed (gaps #3, #4, #7),
  and which were already correct by construction (sequential retries, fresh-case-id-per-POST,
  status-update ordering) — so this doubles as the "note on the race conditions found" the task
  asked for.
- Add it to the `specs/README.md` index table.
- Add one line to `TRIBUNAL_REQUIREMENTS.md` §10.1 pointing to `specs/error-handling.md` for the
  current classification/race-condition detail (consistent with how `specs/status.md` already
  annotates divergences without rewriting the historical doc).

## Files touched

- New: `lib/openrouter/errors.ts`, `supabase/migrations/0004_add_retry_delay_to_call_logs.sql`,
  `specs/error-handling.md`
- Modified: `lib/orchestrator/run.ts`, `app/api/cases/[id]/route.ts`, `app/api/run/route.ts`,
  `app/api/extract/route.ts`, `app/page.tsx`, `app/globals.css`, `specs/README.md`,
  `source-material/TRIBUNAL_REQUIREMENTS.md` (one-line pointer only)

## Verification

- `npm run build` (typecheck + Next build) and `npm run lint` — required by `CLAUDE.md` before
  calling anything done.
- Apply migration `0004` to the dev Supabase project, then `npm run dev` and manually run the
  seeded Jon Snow case: confirm normal success path still works end-to-end (7 outputs, audit trail,
  totals).
- Can't cheaply trigger a real 401/429/5xx from OpenRouter on demand — verify the classifier logic
  by temporarily pointing `OPENROUTER_API_KEY` at a bad value for one manual run (real 401, confirm
  fail-fast — no 3x retry burn, and the panel shows the auth message) and by reasoning through the
  other branches in code review, since the actual retry-loop code path (sequential await, backoff,
  non-retryable short-circuit) is deterministic and doesn't depend on network conditions.
- Show the diff for review before considering this done, as requested.
