# The Tribunal

![Next.js](https://img.shields.io/badge/-Next.js%2015-000000?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/-React%2019-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/-Supabase-3ECF8E?logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/-Vercel-000000?logo=vercel&logoColor=white)

**An LLM courtroom-simulation app, built as an ASE26 class project.**

A charge sheet goes in; 4 advocate agents (2 defense, 2 prosecution) argue independently; 3 judge
agents each read the case plus all 4 arguments and render an independent verdict. Every one of the
7 calls is fully audited: exact prompt, output, tokens, cost, and duration, frozen at call time.

---

## The Docs

This README is the map. Each doc below covers one slice in depth — read the one that matches what
you're trying to do.

| Doc | What it's for |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Architecture, non-negotiable invariants, and working conventions. **Read this first if you're changing code.** |
| [`SETUP.md`](./SETUP.md) | Where your OpenRouter/Supabase keys actually go, locally and in production. |
| [`RUNBOOK.md`](./RUNBOOK.md) | How to actually use a deployed instance — no login, what's pre-loaded, where results and the audit trail show up. |
| [`specs/README.md`](./specs/README.md) | The as-built spec set (data model, API surface, security boundary, error handling) plus `specs/GAPS.md` for known open items. |
| [`docs/best-practices.md`](./docs/best-practices.md) | Coding conventions distilled from the codebase as it exists today. |
| [`docs/plans/`](./docs/plans) | Implementation plans (some executed, some partially — each has a status header). |
| [`source-material/TRIBUNAL_REQUIREMENTS.md`](./source-material/TRIBUNAL_REQUIREMENTS.md) | The original requirements/architecture doc — historical rationale for *why* things are shaped this way. Where it disagrees with `specs/`, `specs/` wins. |

---

## What's Inside

```
TribunalApp/
|-- app/                      # Next.js App Router
|   |-- page.tsx                    # The single-page UI: case editor, 7 agent panels, run trigger
|   |-- layout.tsx
|   |-- api/                        # Route Handlers -- the only place OpenRouter/Supabase get called
|       |-- run/route.ts                # POST -- kicks off the 2-stage advocate/judge pipeline
|       |-- agent-config/route.ts       # GET/PUT -- the 7 agent configs (model, prompt, max_tokens)
|       |-- cases/route.ts              # Case CRUD (charge sheets)
|       |-- generate-case/route.ts      # AI-generated case content
|       |-- extract/route.ts            # Dossier PDF -> case text
|       |-- models/route.ts             # Curated model pool for the UI's dropdowns
|
|-- lib/
|   |-- openrouter/client.ts        # callModel() -- the ONLY file allowed to read OPENROUTER_API_KEY
|   |-- supabase/client.ts          # getSupabaseClient() -- the ONLY file allowed to read SUPABASE_SERVICE_ROLE_KEY
|   |-- orchestrator/
|       |-- run.ts                      # 2-stage pipeline: 4 advocates in parallel, then 3 judges in parallel
|       |-- parseVerdict.ts             # Judge output -> structured verdict
|   |-- constants.ts                # Roles, curated model pool, max_tokens caps -- single source of truth
|   |-- toastMessages.ts            # Centralized toast copy map
|   |-- caseFields.ts
|
|-- components/               # Shared UI pieces (Avatar, Card, SegmentedControl, StatusPill)
|
|-- prompts/
|   |-- seed-content.ts             # The professor's real seed case + 7 real system prompts
|
|-- scripts/
|   |-- seed.ts                     # npm run seed -- seeds agent_configs + the default case
|
|-- supabase/
|   |-- migrations/                 # Additive, hand-numbered SQL migrations (no ORM)
|
|-- specs/                    # As-built spec set (data model, API, security boundary, gaps)
|-- docs/                     # Best practices + implementation plans
|-- source-material/          # Original requirements doc (historical rationale)
```

---

## Installation

### Quick start

```bash
npm install
cp .env.example .env.local   # then fill in real values -- see SETUP.md
npm run seed                 # seeds agent_configs + the default case from prompts/seed-content.ts
npm run dev
```

### Other commands

```bash
npm run build   # typecheck + production build
npm run lint
npm run start   # serve a production build locally
```

Package manager is **npm** (`package-lock.json`) — don't reintroduce a `pnpm-lock.yaml` or a
`packageManager` field without checking with the user first.

---

## Key Concepts

### Advocates and Judges

Every role (2 defense, 2 prosecution, 3 judges) is a row in `agent_configs`: a model, a system
prompt, and a `max_tokens` cap. The orchestrator runs the 4 advocates in parallel, then the 3
judges in parallel — each judge reads the case plus all 4 advocate outputs and renders an
independent verdict:

```ts
// lib/orchestrator/run.ts
const advocateOutputs = await Promise.all(advocateRoles.map(runAdvocate));
const verdicts = await Promise.all(judgeRoles.map((role) => runJudge(role, advocateOutputs)));
```

### The Audit Trail

`call_logs`, `advocate_outputs`, and `verdicts` each snapshot the `model` / `system_prompt` /
`max_tokens` that were actually used **at call time** — never a live join back to the current
`agent_configs` row. Editing a prompt tomorrow must not change what a past run appears to have
used. A failed attempt gets its own `call_logs` row (`attempt_number` 1-3) before the retry fires.

### Missing Output Handling

A missing/failed advocate output is marked, never dropped — judges see an explicit
`UNAVAILABLE_MARKER` for any advocate slot that never produced output:

```ts
// lib/constants.ts
export const UNAVAILABLE_MARKER = "[ADVOCATE OUTPUT UNAVAILABLE]";
```

### max_tokens Clamping

Clamped/floored server-side in two places regardless of what the browser sends — at save
(`PUT /api/agent-config/:role`) and again at call time (`lib/orchestrator/run.ts`):

```ts
// lib/constants.ts
export const MAX_TOKENS_CAP = /* ceiling */;
export const MIN_TOKENS_FLOOR = /* floor -- below this a completion can't fit a coherent response */;
```

---

## Verifying Changes

There is no test suite in this repo yet. Before calling a change done:

```bash
npm run build   # typecheck + Next build
npm run lint
```

Then do a manual run-through: `npm run dev`, submit the seeded Jon Snow case, confirm all 7
outputs plus the audit trail land correctly.

---

## Deployment

Live on **Vercel** (not Netlify, despite what `source-material/TRIBUNAL_REQUIREMENTS.md`
assumes). `SETUP.md` covers where production env vars go; `RUNBOOK.md` has the live URL once a
branch is deployed.

---

## Important Notes

### Secrets Never Reach the Browser

`OPENROUTER_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are read only inside
`lib/openrouter/client.ts` / `lib/supabase/client.ts` — never in a `NextResponse.json(...)` body,
never in a `"use client"` file, never logged.

### Tokens/Cost Are Real or Absent

A response without OpenRouter's real `usage` object is treated as a *failed* call, not a partial
success with guessed numbers.

### No Auth, Single User, by Design

Don't add login/session/multi-tenant scaffolding unless explicitly asked — it's out of scope
(`TRIBUNAL_REQUIREMENTS.md` §14).

See [`CLAUDE.md`](./CLAUDE.md) for the full list of non-negotiable invariants and why each one
exists.

---

## License

Class project for ASE26 — not published under an open-source license.
