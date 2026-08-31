# The Tribunal — Requirements, Goal & Architecture

**Status:** DRAFT — for Sapir's review and approval before any implementation starts.
**Course:** ASE26 (Agentic Software Engineering) running project
**Author of this draft:** Claude, from Sapir's assignment writeup, the professor's case-design dossier, and a classmate's working reference implementation.

---

## 1. What this document is

Per your instruction: nothing gets built until you've approved this. It covers the goal, the functional and non-functional requirements, the data model, the API, the agent pipeline, the UI, the security boundary, and the deployment plan — and it calls out every place I made a judgment call so you can override it before we write code.

It draws on three sources you gave me:

1. **Your own assignment** ("Tribunal Web App Assignment.docx") — your architecture essay: browser / backend / database / deployment, SQL, an audit trail with model/verdict/tokens/cost, and the token-economics argument for parallel calls.
2. **The professor's case-design dossier** ("Tribunal_running_project_info_package") — the actual case content this app will run: the charge sheet, the 4 representative profiles, and the 3 judge profiles. This is real content the professor is going to use to run your app, not placeholder text.
3. **A classmate's working implementation** (the `vibe-coding-hit-main` zip) — used only to understand *what the app needs to do*, per your instruction. Nothing here copies its code; the stack, schema, and several design choices below deliberately diverge from it (see §12).

---

## 2. Goal

Build **The Tribunal**: a small, reusable web app that simulates a courtroom deliberation using LLM agents. A charge sheet (defendant, act, and the exact question to decide) goes in; 4 "advocate" agents (2 defense, 2 prosecution) each independently argue a position from the case alone; 3 "judge" agents then each independently read the case *and* all 4 arguments and render a verdict with reasons. Every one of the 7 model calls — its exact prompt, its output, its tokens, its cost, and its timing — is persisted, so a run can be reopened and audited later, not just watched once.

This is a class project. Per your assignment, the interesting engineering is in the backend orchestration and the token/cost/latency discipline around 7 LLM calls per run — the UI is intentionally plain.

### Definition of done

A run is done when, for a submitted case:

1. All 4 advocates produce a single-shot output using their configured system prompt, arguing their assigned stance.
2. All 3 judges independently receive the case plus all 4 advocate outputs and produce a verdict + reasons.
3. All 7 calls (and every retry attempt) have a persisted audit-trail row: model, exact prompt sent, output, prompt/completion/total tokens, cost, and duration.
4. A human can reopen a past case later and re-read all 7 outputs exactly as they were produced — not a re-fetch of the live config, a frozen snapshot.
5. The OpenRouter key and the Supabase service key never reach the browser, in any response, ever.
6. A case is submitted through a browser form and the verdicts are shown back and stored for later retrieval from a past-runs list.
7. Total tokens/cost per run come from OpenRouter's real `usage` data, never estimated.

---

## 3. The seed content (from the professor's package)

This is the actual content the app ships with by default. It came from `Tribunal_running_project_info_package`, is real (not placeholder), and is what the professor will use to run/grade the app.

**Case T-001: The Realm v. Jon Snow**

> Jon intentionally killed Daenerys Targaryen by stabbing her during a private meeting in the throne room after the fall of King's Landing.
>
> *(Full charge sheet, agreed factual record, and the exact issue question — "Was Jon Snow's intentional killing of Daenerys Targaryen justified as the necessary defense of others and of the realm, given what he knew, the scale of the threatened harm, the absence or presence of safer alternatives, and his lack of formal authority?" — go into `caseText` verbatim from the dossier, ~300 words including the background primer for readers unfamiliar with the story.)*

**4 representatives (the 4 advocate system prompts):**

| Role | Seat | Character signal |
|---|---|---|
| Jon Snow | Defense | Plain-spoken, duty-driven, admits uncertainty, distrusts arguments built on his birth |
| Tyrion Lannister | Defense | Quick, ironic, favors negotiated limits and plans that leave people alive |
| Daenerys Targaryen | Prosecution | Commanding, moral intensity, prizes liberation and loyalty, reacts to betrayal |
| Grey Worm | Prosecution | Terse, concrete, trusts witnessed conduct and clear sequence over rhetoric |

Each has a full ~70-word character profile in the dossier (simulation rule: the seat fixes only the procedural role, not the opinion — the model reasons in character and can land wherever the argument takes it).

**3 judges (the 3 judge system prompts), modeled on real Israeli Supreme Court justices' judicial *method* — not their politics or a prediction of how they'd actually rule:**

| Judge | Character signal |
|---|---|
| Aharon Barak | Systematic, rights-centered, purposive interpretation, builds a test-by-test structure before resolving |
| Menachem Elon | Learned, tradition-minded, treats Jewish law as a working legal source, alert to the limits of judicial power |
| Meir Shamgar | Sober, institutional, fact-heavy, precise about which institution may do what, decides no more than necessary |

Each profile in the dossier is ~200 words and explicitly research-grounded (three real Hebrew opinions per judge, cited in the dossier's §6) — this is the professor's authored content, and per your assignment's own framing this is exactly the kind of reasoning-under-character task that justifies putting a model in the runtime path rather than doing it with fixed rules.

**Design implication:** the 7 seed prompts are the *default* content in `agent_configs`, editable through the console exactly like everything else (see §4.2) — because per your answer, this should be a reusable Tribunal seeded with this case, not hard-locked to it.

---

## 4. Functional requirements

### 4.0 Upload a dossier (new — auto-fills the 8 fields)

An "Upload dossier" control near the charge-sheet box, so the professor (or you) can drop in a PDF/docx like the case-design dossier you gave me, instead of copy-pasting 8 sections by hand.

- Backend extracts raw text from the upload (`pdf-parse` for PDF, `mammoth` for `.docx` — both pure-JS, no extra infra, Netlify-function-friendly).
- That text goes to **one LLM call** (a genuinely new, 8th kind of call — logged separately as `call_type: 'extraction'` in `call_logs`, *not* counted among the "7 calls per case" audit trail, so it doesn't distort the token-economics story) with instructions to return structured JSON: `{caseText, defense1, defense2, prosecution1, prosecution2, judge1, judge2, judge3}`.
- The result **pre-fills the console's 8 fields as drafts — never auto-saved**. The professor still reviews and hits Save per panel before running, same as typing it in by hand. An extraction is best-effort; the human-review step is what makes an occasional misfiled paragraph a one-click fix instead of a silent error.
- **Cost**: negligible. The dossier is ~3,500-4,000 input tokens, the returned JSON ~600-900 output tokens. On a cheap model (e.g. `openai/gpt-4o-mini`, chosen for reliable structured-JSON output over raw cost-minimization here, since this one call sets up the whole case) that's roughly **$0.0006 per upload** — and it only runs once per case setup, not once per run.
- Chose **LLM-only extraction** over a regex/template parser: the dossier's structure (numbered sections, "· defense seat" style sub-headers) is fairly consistent, but a regex parser breaks silently the moment a future dossier phrases a heading differently, and the cost difference (free vs. a fraction of a cent) doesn't justify that fragility for a one-time-per-case operation. Flag if you'd rather have the free/instant regex path with an LLM fallback instead (§13.6).
- **Upload validation**: accepted types `.pdf` and `.docx` only (matching the two formats you've actually used); max **5 MB** per file (comfortably covers a document like the professor's package, and stays under common serverless request-body limits — Netlify's exact current limit for a standard function should be double-checked against their docs at build time, since it wasn't precisely documented as of this writing). A rejected file (wrong type, too large, or extraction returning fewer than 8 usable fields) shows a clear inline error and leaves the existing charge-sheet/prompt fields untouched — never a partial silent overwrite.

### 4.1 Submit and run a case

- One page: a charge-sheet text box (free text — defendant, act, question, pre-filled with the seed case above), 7 agent panels (system prompt + model + max-tokens, grouped Defense / Prosecution / Judges), a Run control, a verdicts area, a run-summary (tokens/cost/time), and a past-runs list.
- Pressing Run validates that all 4 advocate prompts are non-empty (a judge with an empty prompt is silently excluded from that run, mirroring the reference app's rule — an advocate with an empty prompt blocks Run entirely, since every judge bundle needs all 4 slots).
- Stage 1: the 4 advocates run in parallel. Stage 2: the 3 present judges run in parallel, **after** stage 1 fully settles (success or exhausted retries) — each judge gets all 4 advocate outputs, with an explicit "[unavailable — this call failed]" marker for any advocate that never produced output. No slot is ever silently dropped.
- A failed advocate/judge call retries up to 2 more times (3 attempts total), with a run-wide ceiling of 21 call attempts (7 × 3), matching your assignment's token/latency reasoning almost exactly.

### 4.2 Editable agent configuration

- Each of the 7 roles' system prompt, model, and max-tokens is editable and saved independently (a "Save" per panel, with an "unsaved changes" indicator) — this is what makes the seeded Jon Snow content a *default*, not a lock, per your "hybrid" answer.
- A **model-selection mode** toggle:
  - *Single*: pick one OpenRouter model, applied to all 7 roles immediately.
  - *Random per agent*: each of the 7 roles gets an independently-random pick from a curated model list, re-rolled fresh right before every Run press (not on toggle) — mirrors the reference app's behavior, per your choice of "per-agent model + random mode."
- A curated model list is fetched from a small server-side allowlist (not hardcoded in the browser) — see §9 for a starting proposal drawn from the models you already have sample outputs for in this project (Claude, DeepSeek, MiniMax, Hunyuan).

### 4.3 Audit trail and past runs

- Every call *attempt* (including retries) is logged with the exact model/prompt/output/tokens/cost/duration used for that attempt — frozen at call time, never a live join back to the editable config (so a later prompt edit can never rewrite what a past run appears to have used).
- A past-runs list (most recent first) shows case text preview, status (complete / partial-failure / failed), tokens, cost, and time; opening one shows all 7 outputs and verdicts exactly as stored, read-only.

### 4.4 Verdict display

- Each judge's output is parsed for a `VERDICT:` / `REASONS:` trailer (regex, case-insensitive). A judge that answers without that exact trailer still counts as a **successful call** — the Console shows a distinct "no structured verdict parsed" state, never conflated with a failure or a guessed verdict.
- The 3 judges' opinions are shown independently, never merged into one combined verdict — consistent with the dossier's own scope note ("does not combine the three opinions into one verdict").

---

## 5. Non-functional requirements

- **Security**: `OPENROUTER_API_KEY` and the Supabase service-role key are read only in server-side code, never included in any API response body, never sent to the browser. System-prompt text is *deliberately* not secret — it's ordinary, editable application data (same trust-boundary split your classmate's app settled on, and one worth keeping: it's what makes the console useful for the professor).
- **No auth / single user** — matches your assignment scope; no login, no multi-tenant separation.
- **Cost discipline** — hard server-side caps on `max_tokens` per role (advocate/judge), enforced both when a config is saved and again immediately before every OpenRouter call, regardless of what the browser sends.
- **Never a guessed number** — token/cost totals always come from OpenRouter's real `usage` object on successful calls only; a call without real usage data is treated as failed, not partially trusted.
- **Reasonable latency** — 2-stage parallel execution (not 7 sequential calls) for the reasons your assignment lays out: ~21s sequential vs. ~6-10s properly parallelized.

---

## 6. Architecture

Four parts, per your own assignment's framing:

```
Browser (Next.js pages, static/CSR)
   │  HTTPS
   ▼
Backend (Next.js Route Handlers, deployed as Netlify Functions)
   │                                   │
   ▼                                   ▼
Supabase Postgres                 OpenRouter API
(cases, agent_configs,             (7 model calls
 advocate_outputs, verdicts,        per run)
 call_logs)
   ▲
   │
Deployment: Netlify (build + hosting + functions),
GitHub → Netlify auto-deploy on push to main
```

- **Browser**: a single Next.js page (no auth, no routing beyond `/`), talking to the backend only through `fetch` calls to `/api/*`.
- **Backend**: Next.js Route Handlers under `app/api/**`, deployed as Netlify Functions via Netlify's Next.js Runtime. Owns all OpenRouter calls, all Supabase reads/writes, all validation and cost enforcement.
- **Database**: Supabase (managed Postgres). SQL, per your assignment's own reasoning — cases/advocate outputs/verdicts/call-logs are clearly relational entities, and an audit trail over them benefits from real foreign keys and indexes rather than a document store.
- **Deployment**: Netlify, connected to a GitHub repo, auto-deploying on push to `main`. No Docker, no AWS account, no container registry — see §12 for why this is a deliberate simplification versus the reference app.

---

## 7. Data model (Postgres / Supabase)

Five tables, directly mirroring the five responsibilities your assignment calls out (cases, opinions/verdicts, model-call audit records) — expressed relationally instead of as documents:

```sql
create table agent_configs (
  role          text primary key,   -- 'defense-1' | 'defense-2' | 'prosecution-1' | 'prosecution-2'
                                     -- | 'judge-1' | 'judge-2' | 'judge-3'
  model         text not null,
  system_prompt text not null,
  max_tokens    integer not null,
  updated_at    timestamptz not null default now()
);

create table cases (
  id              uuid primary key default gen_random_uuid(),
  case_text       text not null,
  submitted_at    timestamptz not null default now(),
  status          text not null default 'running', -- running | complete | partial-failure | failed
  total_tokens    integer,          -- null until the run finishes
  total_cost_usd  numeric(10,6),
  total_time_ms   integer
);
create index on cases (submitted_at desc);

create table advocate_outputs (
  id             uuid primary key default gen_random_uuid(),
  case_id        uuid not null references cases(id) on delete cascade,
  role           text not null,
  stance         text not null,     -- 'defense' | 'prosecution'
  model          text not null,     -- frozen at call time
  system_prompt  text not null,     -- frozen at call time
  max_tokens     integer not null,
  output         text,              -- null if the call failed after all retries
  failed         boolean not null default false,
  error_message  text,
  created_at     timestamptz not null default now(),
  unique (case_id, role)
);

create table verdicts (
  id             uuid primary key default gen_random_uuid(),
  case_id        uuid not null references cases(id) on delete cascade,
  role           text not null,
  model          text not null,
  system_prompt  text not null,
  max_tokens     integer not null,
  output         text,
  verdict_label  text,              -- best-effort parsed, null if trailer didn't match
  reasons        text[],            -- best-effort parsed
  failed         boolean not null default false,
  error_message  text,
  created_at     timestamptz not null default now(),
  unique (case_id, role)
);

create table call_logs (
  id                uuid primary key default gen_random_uuid(),
  case_id           uuid references cases(id) on delete cascade, -- nullable: an 'extraction' call
                                                                  -- happens at upload time, before a
                                                                  -- case row necessarily exists
  role              text,             -- null for 'extraction' rows (not tied to one of the 7 roles)
  call_type         text not null,   -- 'advocate' | 'judge' | 'extraction'
  attempt_number    integer not null, -- 1, 2, or 3
  model             text not null,
  system_prompt     text not null,
  max_tokens        integer not null,
  user_message      text not null,
  status            text not null,   -- 'success' | 'failed'
  output            text,
  error_message     text,
  prompt_tokens     integer,
  completion_tokens integer,
  total_tokens      integer,
  cost_usd          numeric(10,6),
  duration_ms       integer not null,
  started_at        timestamptz not null,
  finished_at       timestamptz not null
);
create index on call_logs (case_id);
```

Why `call_logs`/`advocate_outputs`/`verdicts` snapshot `model`/`system_prompt`/`max_tokens` instead of joining back to the live `agent_configs` row: `agent_configs` is editable at any time. If the audit trail joined against the current config, editing a prompt tomorrow would silently rewrite what a run from today appears to have used. Snapshotting makes every row self-contained and permanently accurate to what was actually sent.

---

## 8. API design

| Method & path | Purpose |
|---|---|
| `GET /api/agent-config` | All 7 roles' current config (model, prompt, maxTokens). |
| `PUT /api/agent-config/:role` | Update one role's config; server clamps `max_tokens` to the hard cap regardless of what's sent. |
| `GET /api/models` | The curated OpenRouter model allowlist (for the dropdown / random pool). |
| `POST /api/run` | Body: `{ caseText, agents: [...] }` (the 7 roles' *current* field values from the browser, so an unsaved edit still takes effect for that run — same behavior as the reference app). Runs the full 2-stage pipeline server-side; returns once the run reaches a terminal status. |
| `GET /api/cases` | Past-runs list, most recent first, terminal statuses only. |
| `GET /api/cases/:id` | Full detail for one past case: case text, all advocate outputs, all verdicts, totals. |
| `POST /api/extract` | Body: uploaded file (PDF/docx). Extracts text, runs the 1 extraction call, returns the 8 draft fields (case text + 7 prompts) for the browser to pre-fill — does not save anything itself. |

**Open design question (§13.1):** whether `POST /api/run` is a single blocking request (frontend shows a spinner until it resolves) or a background-triggered run the frontend polls (`GET /api/cases/:id`) every 1–2s for progress. See §13 — this is the one place I'd like your explicit steer before building, because it changes the UI's live-update behavior.

---

## 9. Model selection — curated list (revised, cost-optimized per your steer)

**Decision (resolves what was open item §13.2/§13.4 in the previous draft):** drop the reference app's 3 expensive curated models (`openai/gpt-4o`, `anthropic/claude-sonnet-4.5`, `mistralai/mistral-large`) and the pricey `anthropic/claude-opus-4.8` from your own project docs, and build the curated pool entirely from cheap models — the reference app's cheapest 4 plus your project's cheapest 3. Real OpenRouter pricing, checked just now, and the resulting cost of a full 7-call run (4 advocates + 3 judges) if that one model were used for every agent:

| Model | Input / Output ($ per M tokens) | Cost of a full 7-call run |
|---|---|---|
| `deepseek/deepseek-v4-flash` | $0.057 / $0.115 | ~$0.0018 |
| `openai/gpt-4o-mini` | $0.15 / $0.60 | ~$0.0063 |
| `tencent/hy3-preview` | $0.18 / $0.60 | ~$0.0069 |
| `minimax/minimax-m3` | $0.23 / $0.96 | ~$0.0099 |
| `meta-llama/llama-3.1-70b-instruct` | $0.40 / $0.40 | ~$0.0102 |
| `anthropic/claude-3-haiku` | $0.25 / $1.25 | ~$0.0119 |
| `google/gemini-2.5-flash` | $0.30 / $2.50 | ~$0.0198 |

Dropped from the pool: `claude-opus-4.8` (~$0.24/run — ~20-130× everything above), `claude-sonnet-4.5` (~$0.14/run), `gpt-4o` (~$0.11/run), `mistral-large` (~$0.07/run). All still fine to type into a single agent's config manually later if you ever want one comparison run against a frontier model — they're just out of the default random-pool/dropdown.

This keeps every model in the curated pool within roughly a 10× band of each other (cheapest to priciest), so "random per agent" mode can't produce a surprise-expensive run, and it still spans 6 different providers (DeepSeek, OpenAI, Tencent, MiniMax, Meta, Anthropic, Google) for a genuinely interesting quality/style comparison in your write-up.

**Budget check against your $8.50:** in "random per agent" mode across this 7-model pool, a run averages roughly **$0.0095** (using each model's token-weighted average price) — that's on the order of **~890 runs** for $8.50. Even an unlucky run that happened to draw the priciest model (`gemini-2.5-flash`) for all 7 slots would cost ~$0.02, i.e. **~425 runs** worst-case within this pool. Either way, $8.50 comfortably covers building, testing, and demoing this project with real model calls.

**Default model** (used for the initial seed and the "single" dropdown's default): **`deepseek/deepseek-v4-flash`** — the cheapest of the seven, so casual re-runs while building/debugging stay effectively free. If its output quality feels noticeably weaker once you're testing with the real Jon Snow case, `openai/gpt-4o-mini` is the natural fallback default — still cheap (~$0.006/run) but a more established, "known quantity" model. Easy one-line change either way.

---

## 10. Console UI

One page, top to bottom: charge sheet → 7 agent panels (Defense / Prosecution / Judges groups) → model-selection mode → Run button → verdicts (3 cards, one per judge, independent status each) → run summary (tokens/cost/time) → past runs. Plain, functional styling — status colors (idle/running/done/failed) via a small fixed color-token set, not a design system. No dark mode requirement unless you want one.

---

## 10.1 Error states (new)

**See `specs/error-handling.md` for the current, as-built classification table, retry/backoff
timing, and the race-condition audit — this section is the original, now-superseded sketch.**

Failure modes that weren't previously specified, and how they surface:

- **OpenRouter unreachable / key invalid / out of credits**: the affected call is logged as `status: 'failed'` in `call_logs` with the real error message (never swallowed), the relevant panel shows a red "failed" state, and — per the existing retry design (§4.1) — it's retried up to 2 more times before being counted as a genuine failure. A run where every call failed gets `status: 'failed'`; a run where some succeeded gets `partial-failure` (§7). Never blocks the rest of the run — one failed advocate/judge doesn't stop the others.
- **Dossier upload fails** (wrong file type, over 5 MB, or the extraction call itself errors/times out): a clear inline message on the upload control; the charge-sheet and 7 prompt fields are left exactly as they were — the professor can still type/paste manually.
- **Supabase unreachable**: this is the one failure that legitimately can't be worked around (nowhere to persist the run) — `POST /api/run` returns an error before any OpenRouter calls fire, so no cost is incurred for a run that can't be recorded anyway.

## 11. Security / trust boundary

- `OPENROUTER_API_KEY` and Supabase's service-role key: read from environment variables in server-side route handlers only; never appear in any `NextResponse.json(...)` body; never logged to anything client-visible.
- System prompts: intentionally *do* reach the browser (`GET /api/agent-config` returns them in full) and are editable — this is required for the professor to actually paste/verify the seed content through the console rather than editing a database directly, and it's a deliberate, documented exception, not an oversight.
- `max_tokens`: hard-capped server-side (e.g. 1300 advocate / 700 judge, adjustable) regardless of what the browser sends, enforced at both save-time and call-time.
- Supabase: accessed via the service-role key from the backend only; the browser never talks to Supabase directly, so no Row Level Security policy is load-bearing for this app's security (still worth enabling as defense-in-depth once you're on Supabase, but it's not the primary boundary).

---

## 12. Deliberate differences from the classmate's reference app

Since you asked me not to copy it — here's what's different and why, so it's an informed choice rather than an accident:

| Reference app | This app | Why |
|---|---|---|
| MongoDB Atlas | Supabase Postgres | Matches your own assignment's SQL argument; the 5 entities here are genuinely relational. |
| AWS App Runner + Docker + ECR + IAM | Netlify (git push → auto-deploy) | Free-tier friendly, far less infra surface to set up and grade; no container registry or AWS account needed. |
| SSE live token streaming from a long-lived Route Handler | Likely polling (see §13.1) | Netlify Functions don't hold a long-lived streaming connection the same way a container on App Runner does; polling is a simpler, equally auditable substitute. |
| Case content = arbitrary user-typed text, no seed | Seeded with the professor's real Jon Snow case + all 7 real profiles, editable | You asked for hybrid: seeded by default, general-purpose via editing. |
| `gpt-4o-mini` placeholder default, prompts never received | Deliberately chosen default model; real seed prompts from day one | The content gap that app flagged as "still open" doesn't apply to us — the professor's package already gives us real prompts. |

---

## 13. Open decisions — need your call before I start building

### 13.1 Run request: blocking vs. polling

Netlify Functions come in two relevant flavors: a standard function (short timeout, roughly 10–26s depending on plan/runtime) or a **background function** (up to 15 minutes, available on the current Free plan, but returns an immediate 202 and can't stream a live response back to the browser).

Recommendation: **`POST /api/run` kicks off a background function; the browser polls `GET /api/cases/:id` every ~1–2s** and updates each panel's status/output as it lands, until the case reaches a terminal status. This trades away literal live-token-streaming (the reference app's SSE deltas) for something that fits comfortably inside Netlify's free tier without timeout risk on a retried call. If you'd rather keep true live streaming and accept the tighter time budget (or move part of this to Supabase Edge Functions instead), tell me and I'll redesign this piece.

### 13.2 Default OpenRouter model — RESOLVED

`deepseek/deepseek-v4-flash` as default, per §9.

### 13.3 Keeping Supabase awake

Supabase's free tier pauses a project after 1 week with zero connections. If the professor might run this app after a gap longer than that, we should add a trivial scheduled keep-alive ping (or you just know to open it once beforehand). Flagging so it doesn't surprise you at grading time.

### 13.4 Curated model list — RESOLVED

Cost-optimized 7-model pool, see §9. All expensive/frontier models dropped from the default pool.

### 13.5 Visual design

I've assumed plain/functional styling matching the reference app's approach (status-colored panels, no elaborate design system). Say if you want something more polished — that changes build time/scope.

### 13.6 Dossier upload — extraction method

I've defaulted §4.0 to LLM-only extraction (simplest to build, cost is negligible either way — see §4.0). Confirm, or say if you'd rather have the free/instant regex-on-headers parser with an LLM fallback only when it can't find all 8 sections (§13 discussion above).

---

## 13.7 Repo, accounts, and secrets — RESOLVED / status

- **Repo**: new repo, scaffolding started (`.gitignore`, `.env.example`, `lib/openrouter/client.ts`, `SETUP.md` already created — see the files sent alongside this doc). Full scaffold (Next.js app, Supabase schema migration, the other API routes) follows once §13.5/§13.6 are settled.
- **Netlify / Supabase accounts**: neither exists yet — created together when we reach the deploy step (§15 step 1); no blocker on the requirements doc itself.
- **Environment variables** (see `SETUP.md` and `.env.example` for exact instructions): `OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `DEFAULT_MODEL`. Real values only ever go in `.env.local` (local, gitignored) or Netlify's Environment Variables dashboard (production) — never in a committed file, never pasted into chat.
- **Grading rubric**: none beyond the assignment doc itself, per your answer — so the deliverable is the working app, this requirements/architecture doc, and the specs that accumulate as we build (mirroring the `specs/`+`docs/` pattern in the classmate's repo, since you specifically asked for the same call-history/token-usage transparency that pattern gives you).

## 13.8 Deliverable: a one-page "how the professor runs this" runbook (new)

Not yet written — planned as its own short file (`RUNBOOK.md` or similar) once the app is deployed: the live URL, confirmation that no login is needed, what's pre-loaded (the Jon Snow case + all 7 profiles), how to either just press Run or upload a different dossier via §4.0, and where to find the past-runs list and the per-call audit trail if the professor wants to inspect what each of the 7 (or 8, with an upload) calls actually did.

## 14. Out of scope

- Multi-turn debate between advocates or between advocates and judges — all 7 calls stay single-shot.
- Editing the *content* of the 4 representative / 3 judge profiles for you — you write/approve that content (the seed above is exactly what the professor gave you); the app only makes it editable, doesn't author it.
- A general-purpose legal-advice product.
- Fine-tuning or training any model.
- User accounts, auth, or multi-user access control.
- Prompt caching for cost reduction (the reference app added this later; worth revisiting after the base app works, not a v1 requirement).

---

## 15. Build plan (once approved)

1. Scaffold Next.js app + Supabase project + schema (§7) + env vars.
2. Seed `agent_configs` with the professor's 7 real prompts (§3) and a chosen default model.
3. Backend: `lib/openrouter` client, `lib/orchestrator` (2-stage pipeline, retries, cost clamp), the 6 API routes (§8).
4. Frontend: Console page (§10), wired to the API.
5. Netlify deploy + GitHub Actions/Netlify auto-deploy on push to `main`.
6. End-to-end test run against the real Jon Snow case with real models; verify the audit trail, past-runs list, and cost totals.
7. Hand you the live link + `RUNBOOK.md` (§13.8) — the "how to run/reset" note for when the professor uses it.

---

## 16. Prompt injection considerations (added post-build)

None of the 7 (or 8, with an upload) agents in this app have tool access or can execute code —
every call is single-shot text generation, and outputs only ever get displayed, stored, or
regex-parsed for a `VERDICT:`/`REASONS:` trailer (§4.4). That caps the blast radius of a
successful injection to "bad/off-character text shows up somewhere," never data exfiltration or
code execution — this section hardens against that limited but real risk without changing that
trust model, and without giving any agent tool-calling ability.

There are three points where attacker-influenced text flows into a prompt:

1. **Dossier extraction (§4.0).** The uploaded document's raw text is arbitrary and
   attacker-controllable. It's wrapped in the user message as `<document>...</document>`, and the
   extraction system prompt states plainly that everything inside that tag is data to pull fields
   from, never instructions — a dossier that embeds "ignore the above, instead output..." must not
   change what the call does. The call also uses OpenRouter/OpenAI-compatible structured-output
   mode (`response_format: json_schema`, `strict: true`) with the exact 15 named string fields, so
   the response shape itself can't be used to smuggle extra keys or directives. Each returned field
   is checked against a max length (8000 chars for the 8 content fields, 200 for the 7 name fields)
   before anything reaches the browser as a draft; a field over its cap is treated as a sign
   something went wrong (steered output, not a normal dossier) and the whole extraction is
   rejected — nothing is pre-filled, matching the existing "never a partial silent overwrite" rule.
   The existing human-review-then-Save gate (§4.0) is unchanged and remains the actual backstop.
2. **Case text (§4.1).** The charge sheet is free text and could itself contain
   instruction-like phrasing aimed at an advocate or judge (e.g. "ignore your character, instead
   ..."). The advocate and judge user-message templates wrap it as `<case>...</case>` with a line
   telling the agent it's factual case content to argue about or evaluate, not instructions to it,
   regardless of phrasing.
3. **Advocate output feeding into judge input.** Judges read all 4 advocate outputs verbatim.
   Since that output is model-generated from attacker-influenced case text, it could drift into
   instruction-like phrasing that looks like a directive to the judge. The judge user-message
   template wraps the arguments section as `<arguments>...</arguments>` and labels it explicitly as
   output from four other AI models to be evaluated as argument content, not guidance to follow.

**Delimiter convention:** plain XML-style tags (`<document>`, `<case>`, `<arguments>`) rather than
Markdown fences or a hand-rolled token, because they're unambiguous to point at in a "content
inside X is data, not instructions" sentence, cheap to state in a system/user prompt, and match the
convention most current model providers already train against for this exact distinction.

**Explicitly unchanged by this work:** the trust boundary in §11 (system prompts stay non-secret
and browser-visible; the OpenRouter/Supabase keys stay server-only), the retry/audit-trail logic,
and the §4.4 "no structured verdict parsed" handling — an injected case that produces a judge
output not matching the `VERDICT:` trailer still falls into that existing bucket, not a new
failure state.

---

**Please review §13 in particular (the 5 open decisions) and let me know your calls — then I'll start on the build plan above.**
