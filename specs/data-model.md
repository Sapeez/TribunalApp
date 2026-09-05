# Data model spec

This is the schema spec that `supabase/migrations/0001_init.sql` through
`0006_add_name_to_agent_configs.sql` were built against, migration by migration. It supersedes
`TRIBUNAL_REQUIREMENTS.md` §7, which only reflects migration `0001`.

## `agent_configs`

The live, editable config for each of the 7 roles. `role` is the primary key:
`defense-1 | defense-2 | prosecution-1 | prosecution-2 | judge-1 | judge-2 | judge-3`.


| Column          | Type        | Notes                                                  |
| --------------- | ----------- | ------------------------------------------------------ |
| `role`          | text PK     | one of the 7 roles above                               |
| `model`         | text        | OpenRouter model id                                    |
| `system_prompt` | text        |                                                        |
| `max_tokens`    | integer     | clamped server-side to `MAX_TOKENS_CAP` (ceiling) and rejected below `MIN_TOKENS_FLOOR` (floor) on every write |
| `name`          | text        | added in `0006` — persisted display name, written by the dashboard's per-panel Save (`PUT /api/agent-config/:role`); nullable, distinct from the per-run `name` snapshotted into `advocate_outputs`/`verdicts` |
| `updated_at`    | timestamptz |                                                        |


**Never read from here to reconstruct a past run.** This table only reflects the *current* config;
every past run has already snapshotted what it actually used into `advocate_outputs` / `verdicts` /
`call_logs` below.

## `cases`

One row per run.


| Column           | Type          | Notes                                                                                                                                                                                                                                              |
| ---------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | uuid PK       |                                                                                                                                                                                                                                                    |
| `case_text`      | text          |                                                                                                                                                                                                                                                    |
| `submitted_at`   | timestamptz   | indexed desc, for the past-runs list                                                                                                                                                                                                               |
| `status`         | text          | `running` | `complete` | `partial-failure` | `failed` — derived from per-role `failed` flags in `advocate_outputs`/`verdicts`, not from raw `call_logs` rows (a retried-then-succeeded call has both a failed and a success row for the same role) |
| `total_tokens`   | integer       | null until terminal; sum of `call_logs.total_tokens` where `status = 'success'` only                                                                                                                                                               |
| `total_cost_usd` | numeric(10,6) | same rule — successful calls only                                                                                                                                                                                                                  |
| `total_time_ms`  | integer       | wall-clock for the whole run, not sum of per-call durations                                                                                                                                                                                        |




## `advocate_outputs` / `verdicts`

One row per role per case (`unique(case_id, role)`), upserted on `onConflict: "case_id,role"`.
Both tables have the same shape beyond `verdicts` adding `verdict_label`/`reasons`.

Columns beyond `TRIBUNAL_REQUIREMENTS.md` §7's original definition, added in migrations `0002` and
`0003` — **the requirements doc has not been updated to reflect these**:


| Column              | Added in | Notes                                                                                                                                                                  |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`              | 0002     | display name of the agent at run time (from dossier upload or manual entry) — the doc's schema has no equivalent                                                       |
| `total_tokens`      | 0002     | tokens for the successful call for this role (nullable — null if failed)                                                                                               |
| `cost_usd`          | 0002     | USD cost for the successful call (nullable)                                                                                                                            |
| `completion_tokens` | 0003     | added so the UI can compare `max_tokens` (a completion-only cap) against `completion_tokens` apples-to-apples, instead of against `total_tokens` (prompt + completion) |


`verdicts` additionally has `verdict_label` (text, best-effort parsed) and `reasons` (text[],
best-effort parsed) — null on both if the judge's output didn't end with the `VERDICT:`/`REASONS:`
trailer (`lib/orchestrator/parseVerdict.ts`). A missing trailer is **not** a failure — see
`specs/api.md`'s note on `GET /api/cases/:id`.

`model`, `system_prompt`, `max_tokens` on both tables are **frozen at call time** — see
`specs/security-boundary.md` for why this must never become a join back to `agent_configs`.

## `call_logs`

Every call *attempt*, including retries and the extraction call. `case_id` and `role` are nullable
because an `extraction` call (`app/api/extract/route.ts`) happens at upload time, before a `cases`
row necessarily exists, and isn't tied to one of the 7 roles.

`call_type`: `'advocate' | 'judge' | 'extraction' | 'case-generation'` (the last added for the
dashboard redesign's "Generate case with AI", `app/api/generate-case/route.ts` — same `case_id`/
`role` nullability reasoning as `extraction`, not counted in the 7-call-per-run audit trail).
`attempt_number`: 1, 2, or 3
(`MAX_ATTEMPTS_PER_CALL` in `lib/constants.ts`). `status`: `'success' | 'failed'` — a response
with no real `usage` object from OpenRouter is logged as `failed` even if `output` is non-null
(§5 of the requirements doc: never a partially-trusted number).

This table is the single source of truth for run totals and per-role duration (`GET /api/cases/:id` sums `duration_ms` across all attempts for a role).

## Row Level Security

All 5 tables have RLS enabled with **zero policies** (migration `0001`). This is defense-in-depth,
not the primary boundary: the browser never talks to Supabase directly, and the backend always
uses the service-role key, which bypasses RLS regardless. Enabling RLS just means the anon/public
key — never used by this app — can't read or write anything if it were ever accidentally exposed.
Don't add RLS policies expecting them to do real authorization work here.