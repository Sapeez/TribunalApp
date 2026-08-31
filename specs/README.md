# Specs — index

This folder documents **what's actually built**, as opposed to
`source-material/TRIBUNAL_REQUIREMENTS.md`, which documents the original design and rationale
(goal, seed content, the 7-agent pipeline story, the deliberate differences from the reference
app). Read that doc for *why*; read these for *current, as-built reality*. Where they disagree,
this folder wins — it's the one that gets updated as the code changes.

This mirrors the `specs/` + `docs/` pattern the requirements doc itself calls for in §13.7: "the
specs that accumulate as we build."

| File | Covers |
|---|---|
| [`data-model.md`](./data-model.md) | The actual Postgres schema (all 3 migrations applied), and how it diverges from `TRIBUNAL_REQUIREMENTS.md` §7. |
| [`api.md`](./api.md) | The actual API surface — routes, request/response shapes, validation rules — as implemented under `app/api/**`. |
| [`security-boundary.md`](./security-boundary.md) | The trust boundary: what's secret, what's deliberately not, and where each rule is enforced in code. |
| [`status.md`](./status.md) | Implementation status of every §13 open decision, confirmed divergences from the requirements doc (Vercel as the deploy target, PDF-only dossier uploads), and remaining real gaps (package-manager/lockfile mismatch, etc.) — read this before assuming anything in the requirements doc is still accurate. |

For coding conventions (not requirements), see [`../docs/best-practices.md`](../docs/best-practices.md).
For code review, see the `code-review` skill (`.claude/skills/code-review/`) and the
`code-reviewer` subagent (`.claude/agents/code-reviewer.md`).
