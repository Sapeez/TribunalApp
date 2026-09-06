# Implementation status & known gaps

Re-verify before trusting any "gap" below — code moves faster than this file.

## §13 open decisions — resolution status

| # | Decision | Status |
|---|---|---|
| 13.1 | Blocking `POST /api/run` vs. polling | **Resolved: polling.** `POST /api/run` returns immediately with the case id; `runCase()` continues via `after()`. Browser polls `GET /api/cases/:id`. |
| 13.2 | Default OpenRouter model | **Resolved:** `deepseek/deepseek-v4-flash` (`lib/constants.ts`). |
| 13.3 | Keeping Supabase awake (free-tier pause after 1 week idle) | **Not addressed in code.** No scheduled keep-alive ping exists. Flag to the user before a demo gap longer than a week. |
| 13.4 | Curated model list | **Resolved:** the 7-model cost-optimized pool from §9, verbatim in `CURATED_MODELS`. |
| 13.5 | Visual design | **Superseded by the dashboard redesign.** No longer plain/functional — `app/globals.css` now ships a full dark-theme design system (`--bg`, `--defense`/`--prosecution`/`--judge` palette). Retire this row as an open decision; see `docs/plans/advocates-judges-avatar-list.md` for the one piece of that redesign line still outstanding. |
| 13.6 | Dossier extraction: LLM-only vs. regex-first-with-fallback | **Resolved as LLM-only**, per the default in §4.0 — `app/api/extract/route.ts` has no regex path. |

## Confirmed deliberate divergences from the requirements doc

Not gaps — decisions the user has made explicitly that supersede `TRIBUNAL_REQUIREMENTS.md`.

- **Deploy target is Vercel, not Netlify.** §6/§12 of the requirements doc assume Netlify
  (auto-deploy on push, Netlify Functions for the API routes). The actual host is **Vercel**.
  Route handlers, `after()` for the fire-and-forget run pipeline, and the polling design (§13.1)
  all work the same way on Vercel, so no code change was needed for this — only the docs.
  **`Dockerfile`/`.dockerignore` removed 2026-09-05** during a repo cleanup pass: Vercel builds
  Next.js natively and never invoked it, and nothing else in the repo (local dev, scripts, CI)
  used it either. If container-based local testing is ever needed again, it can be re-added, but
  don't reintroduce it casually — it was dead weight, not a working alternate deploy path.
- **Package manager is npm, not pnpm.** pnpm was introduced in one commit ("refactor npm") that
  added `pnpm-lock.yaml`/`pnpm-workspace.yaml` and a `packageManager` field, and bumped
  `engines.node` to `22.x` — but the (now-removed) `Dockerfile` kept running `npm ci` against
  `package-lock.json` on Node 20, untouched by that commit. Nothing in the app used a
  pnpm-specific feature (no real workspaces — `pnpm-workspace.yaml` only set `allowBuilds` for
  `esbuild`'s postinstall script). Per the user's call, pnpm has been dropped: `pnpm-lock.yaml`/
  `pnpm-workspace.yaml` removed, `packageManager` field removed, `engines.node` reverted to
  `20.x` (matching what the old `Dockerfile`'s `node:20.18.0-alpine` used). `package-lock.json` +
  `npm` is now the one and only package-manager path — don't reintroduce a second one without
  checking first.
- **Dossier extraction is PDF-only, permanently — `.docx` support was dropped**, not just
  unfinished. §4.0 originally described accepting both PDF and `.docx` (`mammoth` for the latter).
  The `mammoth` dependency has been removed from `package.json`; `app/api/extract/route.ts` was
  already PDF-only in practice (no `.docx` code path ever existed), so no route change was needed.

## Other real gaps between the requirements doc and the current code

1. **`.env.example` was missing** despite `README.md`/`SETUP.md` both instructing
   `cp .env.example .env.local`. Added.

2. **`RUNBOOK.md` (§13.8) written 2026-09-05.** Lives at the repo root, matching `SETUP.md`'s
   style. Its live-URL line is still a placeholder — this branch hasn't been deployed to production
   yet — tracked in `specs/GAPS.md`.

3. **Judge `max_tokens` cap.** §11 gives "e.g. 1300 advocate / 700 judge" as an illustrative
   example; the shipped cap (`lib/constants.ts`) is `1300` advocate / `2000` judge. Consistent with
   §11 being explicitly "adjustable," not a regression — noted only so it isn't mistaken for one.

## Known accepted risks

- **`postcss` high/moderate advisories (2026-09-06), via `next`'s transitive dependency.**
  `npm audit` reports two PostCSS advisories (XSS via unescaped `</style>` in stringify output;
  arbitrary file read via attacker-controlled `sourceMappingURL`). `npm audit fix --force` would
  fix it but bumps to `next@16`, a breaking major version change. Accepted as-is: both advisories
  require stringifying/reading attacker-controlled CSS or source maps at runtime, and this app
  never does either (no user-supplied CSS, no source maps served to end users) — it's a
  build-tool-only exposure, not a live attack surface here. Revisit as part of a deliberate Next 16
  upgrade later, not bundled into an unrelated change just to silence the advisory.

## What to do when you find a new gap like these

Add a row here, don't silently "fix" the doc to match the code or the code to match the doc —
the two diverging is sometimes a deliberate, undocumented decision (like the Vercel/deploy-target
one was, until the user confirmed it) and sometimes a real bug. Ask the user which it is before
resolving either direction, unless it's purely additive documentation (like adding a missing
`.env.example`).
