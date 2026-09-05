# Gaps & outstanding items

Tracks the difference between what a spec/plan says and what the code actually does, or what a
past open decision resolved to. Add a row here when you find a new one instead of silently
"fixing" the doc to match the code or vice versa — see `specs/status.md`'s own rule on this. Items
below marked **Resolved** were closed by direct verification against the code during this pass
(2026-09-05); items marked **Outstanding** are confirmed real gaps still needing work; none are
open questions right now — the three genuinely ambiguous ones from this pass were resolved with
the user and are recorded as decisions below.

## Outstanding — confirmed gaps, not yet closed

1. **Confirm-before-replace banner never built.**
   `docs/plans/advocates-judges-avatar-list.md` §6 called for a "Replace your draft?" confirmation
   before a dossier upload or AI case generation overwrites an existing non-empty case/cast draft.
   `app/page.tsx`'s `handleUpload` and `handleGenerateCaseClick` both call `applyCastFields`
   directly with no confirmation step — confirmed by grep, there is no `confirm`/`window.confirm`
   call anywhere in the file. **Decision (2026-09-05): this was missed, not dropped on purpose** —
   log as real outstanding work. Not fixed in this pass (spec-audit only, no app-code changes).

2. **`RUNBOOK.md`'s live URL is a placeholder.**
   `RUNBOOK.md` (§13.8) was written 2026-09-05, but the live production URL isn't filled in yet —
   this branch still needs to be deployed and the finalized Vercel URL pasted in.

3. **§13.3 Supabase free-tier keep-alive still not addressed in code.**
   Carried forward from `specs/status.md` — no scheduled keep-alive ping exists anywhere in the
   repo (confirmed no cron/scheduled function in `app/api/**` or `supabase/`). Flag before any demo
   gap longer than a week.

## Resolved during this pass

- **§13.5 visual design** — was flagged as an open assumption ("plain/functional") in
  `specs/status.md`, written before the dashboard redesign shipped. Confirmed via
  `app/globals.css` (full dark-theme palette: `--bg`, `--defense`/`--prosecution`/`--judge`) and
  recent commits (`a727d13 app redesign`, `redesign charge sheet buttons`) that the redesign is
  live. `specs/status.md` updated to reflect this; no longer an open decision.
- **Git workflow convention** — no branch/commit convention existed anywhere; all 18 commits to
  date are direct to `main`, no `.github/`, no PR history. **Decision (2026-09-05): intentional** —
  this is a solo class project with no collaborators. Documented in `CLAUDE.md`'s Working
  conventions section as the actual, permanent workflow, not a gap.
- **`docs/plans/advocates-judges-avatar-list.md` had a stale status header** ("Approved, not yet
  executed") even though `lib/caseFields.ts`, `components/Avatar.tsx`, the expanded
  `/api/generate-case`, and the read-only cast list in `app/page.tsx` are all shipped. Header
  corrected to reflect what's actually built vs. the one real gap (item 1 above).
- **"2 defense / 2 prosecution / 3 judges" shape + per-role display name** — both fully resolved,
  no action needed. The 7-role shape is enforced structurally by the fixed `ALL_ROLES` array
  (`lib/constants.ts`), not a runtime count-check, and is already documented in
  `specs/data-model.md`'s `agent_configs.role` column. The display-name field
  (`agent_configs.name`, migration `0006`) is already documented in `specs/data-model.md` and
  `specs/api.md`. Neither was ever actually stranded outside the core spec, despite the historical
  planning doc that raised this as a risk.
- **Dossier-upload vs. AI-generation interaction** — both paths already funnel through the same
  `applyCastFields` helper (`app/page.tsx`) and 15-field schema (`lib/caseFields.ts`), so they
  can't diverge in shape. The one real gap in this area is item 1 above (no overwrite
  confirmation), not a schema/shape mismatch.
- **Testing / Commands documentation** — not actually missing: `docs/best-practices.md` documents
  the deliberate absence of a test suite, and `CLAUDE.md` names the exact commands
  (`npm run build`, `npm run lint`, `npm run dev`) plus the manual run-through that substitutes for
  automated tests. No change needed.
