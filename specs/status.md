# Implementation status & known gaps

Re-verify before trusting any "gap" below — code moves faster than this file.

## §13 open decisions — resolution status

| # | Decision | Status |
|---|---|---|
| 13.1 | Blocking `POST /api/run` vs. polling | **Resolved: polling.** `POST /api/run` returns immediately with the case id; `runCase()` continues via `after()`. Browser polls `GET /api/cases/:id`. |
| 13.2 | Default OpenRouter model | **Resolved:** `deepseek/deepseek-v4-flash` (`lib/constants.ts`). |
| 13.3 | Keeping Supabase awake (free-tier pause after 1 week idle) | **Not addressed in code.** No scheduled keep-alive ping exists. Flag to the user before a demo gap longer than a week. |
| 13.4 | Curated model list | **Resolved:** the 7-model cost-optimized pool from §9, verbatim in `CURATED_MODELS`. |
| 13.5 | Visual design | Plain/functional, per the default assumption — `app/page.tsx` (1443 lines, single page) uses status-colored panels, no design system. |
| 13.6 | Dossier extraction: LLM-only vs. regex-first-with-fallback | **Resolved as LLM-only**, per the default in §4.0 — `app/api/extract/route.ts` has no regex path. |

## Confirmed deliberate divergences from the requirements doc

Not gaps — decisions the user has made explicitly that supersede `TRIBUNAL_REQUIREMENTS.md`.

- **Deploy target is Vercel, not Netlify.** §6/§12 of the requirements doc assume Netlify
  (auto-deploy on push, Netlify Functions for the API routes). The actual host is **Vercel**.
  Route handlers, `after()` for the fire-and-forget run pipeline, and the polling design (§13.1)
  all work the same way on Vercel, so no code change was needed for this — only the docs. One
  loose end remains: a `Dockerfile` still exists in the repo (multi-stage, Next.js standalone
  output). Vercel builds Next.js natively and does not use it. Confirm with the user whether it's
  still needed for something else (e.g. local container testing) before deleting it.
- **Package manager is npm, not pnpm.** pnpm was introduced in one commit ("refactor npm") that
  added `pnpm-lock.yaml`/`pnpm-workspace.yaml` and a `packageManager` field, and bumped
  `engines.node` to `22.x` — but the `Dockerfile` (untouched by that commit) kept running `npm ci`
  against `package-lock.json` on Node 20. Nothing in the app used a pnpm-specific feature (no
  real workspaces — `pnpm-workspace.yaml` only set `allowBuilds` for `esbuild`'s postinstall
  script). Per the user's call, pnpm has been dropped: `pnpm-lock.yaml`/`pnpm-workspace.yaml`
  removed, `packageManager` field removed, `engines.node` reverted to `20.x` to match the
  `Dockerfile`'s `node:20.18.0-alpine`. `package-lock.json` + `npm` is now the one and only
  package-manager path — don't reintroduce a second one without checking first.
- **Dossier extraction is PDF-only, permanently — `.docx` support was dropped**, not just
  unfinished. §4.0 originally described accepting both PDF and `.docx` (`mammoth` for the latter).
  The `mammoth` dependency has been removed from `package.json`; `app/api/extract/route.ts` was
  already PDF-only in practice (no `.docx` code path ever existed), so no route change was needed.

## Other real gaps between the requirements doc and the current code

1. **`.env.example` was missing** despite `README.md`/`SETUP.md` both instructing
   `cp .env.example .env.local`. Added.

2. **`RUNBOOK.md` (§13.8) not yet written.** Explicitly deferred in the doc until there's a live
   deployment to describe — not a bug, just not done yet. Now that Vercel is the confirmed host,
   this can reference the actual Vercel URL/env-var setup instead of Netlify's.

3. **Judge `max_tokens` cap.** §11 gives "e.g. 1300 advocate / 700 judge" as an illustrative
   example; the shipped cap (`lib/constants.ts`) is `1300` advocate / `2000` judge. Consistent with
   §11 being explicitly "adjustable," not a regression — noted only so it isn't mistaken for one.

## What to do when you find a new gap like these

Add a row here, don't silently "fix" the doc to match the code or the code to match the doc —
the two diverging is sometimes a deliberate, undocumented decision (like the Vercel/deploy-target
one was, until the user confirmed it) and sometimes a real bug. Ask the user which it is before
resolving either direction, unless it's purely additive documentation (like adding a missing
`.env.example`).
