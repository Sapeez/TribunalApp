# The Tribunal

An LLM courtroom-simulation app (ASE26 class project). A charge sheet goes in; 4 advocate agents
(2 defense, 2 prosecution) argue independently; 3 judge agents each read the case plus all 4
arguments and render an independent verdict. Every one of the 7 calls is fully audited: exact
prompt, output, tokens, cost, and duration, frozen at call time.

## Stack

Next.js 15 (App Router, Route Handlers) + React 19 + TypeScript (strict) + Supabase (Postgres) +
OpenRouter (model calls). See `CLAUDE.md` for the full architecture, invariants, and working
conventions.

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in real values — see SETUP.md
npm run seed                 # seeds agent_configs + the default case from prompts/seed-content.ts
npm run dev
```

Other commands: `npm run build` (typecheck + production build), `npm run lint`, `npm run start`
(serve a production build locally).

## Using it

Open the app, use the pre-loaded seed case as-is or replace it (upload a dossier PDF, generate a
case with AI, or edit the 7 agent panels by hand), then click **Generate**. See `RUNBOOK.md` for
the full walkthrough, including where past runs and the per-call audit trail live.

## Where things live

| Doc | What it's for |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Architecture, non-negotiable invariants, and working conventions — read this first if you're changing code. |
| [`SETUP.md`](./SETUP.md) | Where your OpenRouter/Supabase keys actually go, locally and in production. |
| [`RUNBOOK.md`](./RUNBOOK.md) | How to actually use a deployed instance — no login, what's pre-loaded, where results and the audit trail show up. |
| [`specs/README.md`](./specs/README.md) | The as-built spec set (data model, API surface, security boundary, error handling) plus `specs/GAPS.md` for known open items. |
| [`docs/best-practices.md`](./docs/best-practices.md) | Coding conventions distilled from the codebase as it exists today. |
| [`docs/plans/`](./docs/plans) | Implementation plans (some executed, some partially — each has a status header). |
| [`source-material/TRIBUNAL_REQUIREMENTS.md`](./source-material/TRIBUNAL_REQUIREMENTS.md) | The original requirements/architecture doc — historical rationale for *why* things are shaped this way. Where it disagrees with `specs/`, `specs/` wins. |

## Deployment

Live on Vercel. `SETUP.md` covers where production env vars go; `RUNBOOK.md` has the live URL
once this branch is deployed.
