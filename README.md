# The Tribunal — starter folder for Claude Code

Everything needed to start the build. Open this folder in Claude Code and hand it the prompt at
the bottom of this file.

## What's in here

| File | What it is |
|---|---|
| `TRIBUNAL_REQUIREMENTS.md` | The full requirements/architecture doc — goal, functional & non-functional requirements, data model (Postgres schema), API design, agent pipeline, security boundary, deployment plan. **Read this first — it's the spec everything else follows.** |
| `SETUP.md` | Where your OpenRouter (and later, Supabase) keys actually go. Read before touching `.env.example`. |
| `.env.example` | Template for the env vars the app needs (`OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEFAULT_MODEL`). Copy to `.env.local` and fill in real values there — never commit the copy. |
| `.gitignore` | Already excludes `.env.local` and the usual Node/Next.js build output. |
| `lib/openrouter/client.ts` | The actual OpenRouter integration — the one file allowed to read `OPENROUTER_API_KEY`. Drop straight into the Next.js app once scaffolded. |
| `prompts/seed-content.ts` | The professor's real charge sheet + all 7 agent system prompts (4 representatives, 3 judges), transcribed verbatim from `source-material/`. Used to seed the `agent_configs` table and the default case text — see `TRIBUNAL_REQUIREMENTS.md` §3. |
| `source-material/Tribunal_running_project_info_package.pdf` | The professor's original case-design dossier — the source of truth `seed-content.ts` was transcribed from. |
| `source-material/Tribunal_Web_App_Assignment.docx` | Your own architecture-essay assignment — the reasoning `TRIBUNAL_REQUIREMENTS.md`'s stack choices (SQL DB, audit trail, parallel calls) are grounded in. |

## Two open decisions before (or while) building

Both are called out in `TRIBUNAL_REQUIREMENTS.md` — resolve them here or tell Claude Code your
answer directly when you start:

- **§13.5 Visual design** — currently assumed plain/functional (status-colored panels, no design
  system), to be revisited later per your own note.
- **§13.6 Dossier-upload extraction method** — currently defaulted to LLM-only extraction (§4.0);
  confirm, or ask for the regex-first-with-LLM-fallback hybrid instead.

## Not yet created (part of the build itself)

The Next.js app, the Supabase schema/migration, the 6 API routes, the orchestrator, and the
Console UI are all specced in `TRIBUNAL_REQUIREMENTS.md` but not yet scaffolded — that's the actual
build work. `RUNBOOK.md` (the professor-facing "how to run this" note, §13.8) gets written once
there's a live deployment to describe.

## Suggested first prompt for Claude Code

```
Read TRIBUNAL_REQUIREMENTS.md in full, then prompts/seed-content.ts. Scaffold a Next.js app per
the architecture in the requirements doc: the Postgres schema from §7 (as a Supabase migration),
the API routes from §8, the two-stage parallel agent pipeline from §4.1 (using
lib/openrouter/client.ts, which already exists — don't rewrite it), and seed agent_configs from
prompts/seed-content.ts. Follow the resolved decisions in §9 (cost-optimized model pool,
deepseek/deepseek-v4-flash default) and §13 (repo/env already scaffolded, see SETUP.md for where
my OpenRouter key goes). Ask me before making a call on anything still marked open in §13 that
matters for what you're about to build.
```
