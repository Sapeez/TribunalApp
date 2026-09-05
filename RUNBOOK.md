# Runbook — how the professor runs this

The one-page "how to use it" note called for in `TRIBUNAL_REQUIREMENTS.md` §13.8, now that a live
deployment exists.

## Live URL

**TODO: paste the finalized production Vercel URL here once the branch is deployed.**

## No login needed

There's no account, no sign-in, no multi-user access — open the URL and use it. This is
intentional (`CLAUDE.md` invariant #7), not a missing feature.

## What's pre-loaded

The app opens with the seeded case (`prompts/seed-content.ts`) and all 7 agent profiles — 2
defense counsel, 2 prosecutors, 3 judges — already filled in with names, models, and system
prompts. You can run it immediately with no setup.

## Running a case

1. Use the pre-loaded case as-is, **or** replace it:
  - **Upload dossier** — upload a PDF; the app extracts the case text and all 7 names/profiles
   automatically and fills the drafts in for you (review before running — nothing is required to
   match the original exactly).
  - **Generate case with AI** — drafts an original case and cast from scratch.
  - Edit any of the 7 panels (name, model, system prompt) by hand.
2. Click **Generate**. The button disables until every required field (case text, all 7 names, all
  4 advocate prompts) is filled in — if it's greyed out, a tooltip on hover says what's missing.
3. The run proceeds in the background — advocates first, then judges — and updates live. If it's
  taking longer than 5 minutes, it's still running; the result will land in **Past runs** when
   done, no need to keep the tab open.
4. When it finishes, click **See Results** (or find it later under **Past runs**).



## Where to find results and the audit trail

- **Past runs** (bottom of the page) — every finished run, most recent first, with total tokens
and total cost shown inline.
- Clicking into a run's results shows all 4 advocate arguments and all 3 verdicts, each annotated
with its own tokens, cost, and duration.
- **Download** (per run, in Past runs, or from an open results view) exports the full run —
including every logged call attempt, not just the final output — as a `.zip`/`.json` file. This
is the per-call audit trail: exact prompt, output, tokens, cost, and duration for all 7 calls,
frozen at the time each call was made (retries included, each as its own logged attempt).



## Resetting

There's no "reset" action needed — starting a new case (editing the text/cast and clicking
**Generate** again) doesn't touch or overwrite any past run; every run gets its own row in **Past
runs** permanently.

## If something looks wrong

See `docs/toast-message-copy.md` for how errors are worded — every failure names the specific
agent/role affected and says what to do next in plain language, never a raw error string. If a
run shows a failed or missing agent output, that's logged and visible, not silently dropped (see
`CLAUDE.md` invariant #6).