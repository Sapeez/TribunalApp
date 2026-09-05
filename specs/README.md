# Specs — index

This folder holds the specs that built this app. `source-material/TRIBUNAL_REQUIREMENTS.md` is the
original design doc — the goal, seed content, the 7-agent pipeline story, the deliberate
differences from the reference app. The files here are what each part of the system was actually
built *against*: written as the blueprint for a slice of the app, then kept current so they stay
the governing spec as that slice is extended. Read the requirements doc for *why*; read these for
the spec each part of the code was implemented to satisfy. Where they disagree, this folder
wins — it's the one that gets updated as the code changes, and the one to update *before* changing
the code, not just after.

This is the `specs/` + `docs/` pattern the requirements doc itself calls for in §13.7: "the specs
that accumulate as we build."

| File | Covers |
|---|---|
| [`data-model.md`](./data-model.md) | The Postgres schema spec, built out migration by migration (currently through `0006`), and how it diverges from `TRIBUNAL_REQUIREMENTS.md` §7. |
| [`api.md`](./api.md) | The API surface spec — routes, request/response shapes, validation rules — that every route under `app/api/**` is built against. |
| [`security-boundary.md`](./security-boundary.md) | The trust-boundary spec: what's secret, what's deliberately not, and where each rule must be enforced in code. |
| [`status.md`](./status.md) | Implementation status of every §13 open decision, confirmed divergences from the requirements doc (Vercel as the deploy target, PDF-only dossier uploads), and remaining real gaps (package-manager/lockfile mismatch, etc.) — read this before assuming anything in the requirements doc is still accurate. |
| [`error-handling.md`](./error-handling.md) | Supersedes `TRIBUNAL_REQUIREMENTS.md` §10.1: the OpenRouter failure-mode → retryable? → user-message classification table, retry/backoff timing, write-resilience fixes, and race-condition audit that `lib/orchestrator/run.ts` was built against. |
| [`GAPS.md`](./GAPS.md) | Confirmed gaps between a spec/plan and the actual code — some still outstanding, some resolved by direct verification. Read this before assuming a planning doc's status line is current. |

For coding conventions (not requirements), see [`../docs/best-practices.md`](../docs/best-practices.md).
For code review, see the `code-review` skill (`.claude/skills/code-review/`) and the
`code-reviewer` subagent (`.claude/agents/code-reviewer.md`).
