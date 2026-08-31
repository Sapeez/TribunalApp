# Toast message copy — project rule

**Status:** Adopted. Mirrored into `CLAUDE.md`'s "Working conventions" so it applies automatically
to every future toast, not just the ones written when this rule was adopted.

## Context

The Tribunal is a single-user console (no auth, used by the professor to run and review the
7-agent courtroom simulation). It surfaces API/agent failures (OpenRouter down, rate limited,
invalid key, Supabase unreachable, retries in progress, dossier extraction failures, etc. — see
`specs/error-handling.md`) as toast notifications. This doc captures the copywriting rule for
those toast bodies, decided separately from the failure-detection/classification logic itself
(`lib/openrouter/errors.ts`).

## The rule

All user-facing toast bodies follow this voice, whether for an existing failure mode or a new one
added later:

- Two-part shape in one or two short sentences: what happened, then what's next (retrying
  automatically / needs a person to fix something / failed, try again).
- Plain language only — no HTTP codes, internal field names, stack traces, or raw error strings.
  If the cause is genuinely unknown, say so plainly rather than falling back to a technical string.
- Name the specific agent/role affected for any per-agent failure (e.g. "Judge 2") rather than a
  generic "a call failed."
- Calm, matter-of-fact tone — no exclamation points, no apologetic or overly enthusiastic phrasing.
- Never include API keys, database details, or any value covered by the requirements doc's §11
  trust boundary (`specs/security-boundary.md`).

## Where the actual copy lives

The rule above governs *how* to write a toast; the literal strings are a single source of truth in
code — a centralized error-copy map — not duplicated here and not written inline in components.
New failure cases get added there, following the pattern above, rather than as ad hoc strings
scattered across the codebase.

**Implemented:** `lib/toastMessages.ts` is that centralized map — role-prefixed
`agentRetryMessage()`/`agentFailureMessage()`, plus `DB_UNREACHABLE_AT_START`, `RUN_ALREADY_ACTIVE`,
and `uploadMessage()`. `lib/orchestrator/run.ts` builds a `roleLabel` (e.g. "Defense — Jon Snow")
per agent and threads it through every stored `error_message`. `app/page.tsx`'s poll loop diffs
per-role status each tick and fires a one-shot toast the moment a role starts retrying or lands as
failed — see `specs/error-handling.md`'s "Live retrying visibility" section for how.

**Still open, not silently claiming otherwise:**
- `writeFailedMessage()` is defined but not wired to a live signal — if a role's DB write is
  dead-lettered (model call succeeded, the *save* failed after retries), there's currently no API
  signal distinguishing that role from "never ran." See `specs/error-handling.md`'s "known gap."
- "Saving — try again in a moment." (the race-guard example for a blocking config save) has no
  current trigger: this app has no per-role "Save" button today — prompts/names/tokens are sent
  fresh with every Run, and the only PUT-triggering UI (the "single model" dropdown) uses a
  stale-response guard instead of a blocking lock, so nothing ever shows "please wait." Revisit if
  a blocking save is added later.

## Reference examples

Transient, retrying automatically:
- OpenRouter 5xx / provider down: "[Role] couldn't reach the model provider — retrying
  automatically (attempt 2 of 3)."
- Rate limited: "[Role] hit a rate limit — retrying shortly."
- Network blip: "[Role]'s request didn't go through — retrying."

Exhausted retries (final failure for that call):
- Provider-side: "[Role] failed after 3 attempts — the model provider may be down. You can re-run
  the case once it's back."
- Unknown cause: "[Role] couldn't complete after 3 attempts. Check the audit log for this call, or
  try running again."

Non-retryable / config issues (fail fast, no retry attempted):
- Invalid/missing API key: "The connection to the model provider isn't set up correctly — this
  needs to be fixed in the app's settings, not by re-running."
- `max_tokens` over the server cap: "[Role]'s response length setting is too high and was capped
  automatically." (informational, not an error)

Database / persistence:
- Supabase unreachable at run start: "Couldn't start the run — the database isn't reachable right
  now, so nothing was sent to the model provider and no cost was incurred. Try again in a moment."
- Write failure mid-run: "[Role]'s response came back but couldn't be saved — this may need a
  re-run to be recorded correctly."

Dossier upload / extraction:
- Wrong file type: "Only PDF files are supported." (this app is PDF-only — see
  `specs/status.md` on the dropped `.docx` path; don't advertise a format the app doesn't accept)
- Over size limit: "That file is larger than 5 MB — try a smaller file."
- Extraction incomplete: "Couldn't pull all the fields from that document — review and fill in
  what's missing below."
- Extraction call failed/timed out: "Couldn't process that document right now. You can still fill
  in the case fields by hand."

Race-condition guard surfaced to the user:
- "This case is already running." / "Saving — try again in a moment."

These examples are a starting point, not exhaustive — any new failure mode should be written to
match the rule above, then added to the centralized map.
