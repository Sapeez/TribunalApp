---
name: code-review
description: Review a pull request, branch diff, or set of code changes in the TribunalApp repo for correctness, security, test coverage, and maintainability before merge. Trigger on "review this PR", "code review", "review my changes", or the /code-review command.
---

# Code review

## Steps

1. **Determine scope.** Figure out exactly what to review:
   - If the user named a PR, get its diff (e.g. `gh pr diff <number>`).
   - If they named a branch, use `git diff <base>...<branch>`.
   - If they're mid-work with uncommitted changes, use `git diff` / `git diff --staged`.
   - If the target is ambiguous, ask which PR/branch/diff to review before doing anything else.

2. **Gather context.** Pull the PR title/description if available (`gh pr view <number>`), and
   skim this repo's own conventions before judging what "correct" looks like here:
   - `CLAUDE.md` — stack, file map, and the non-negotiable invariants (secrets boundary,
     audit-trail snapshot pattern, cost caps, pipeline ordering).
   - `specs/security-boundary.md`, `specs/data-model.md`, `specs/api.md` — as-built behavior for
     whatever area the diff touches.
   - `specs/status.md` — confirmed intentional divergences from the older requirements doc
     (Vercel not Netlify, npm not pnpm, PDF-only upload) so you don't flag an already-settled
     decision as a regression.
   - `docs/best-practices.md` — coding conventions actually in use (route-header comment style,
     the audit-trail logging pattern, singleton client rule).

3. **Delegate the review.** Spawn the `code-reviewer` subagent (Agent tool) and pass it:
   - the diff itself, or the exact command to retrieve it
   - the PR's stated goal/description
   - any repo-specific conventions or constraints found in step 2 that are relevant to this diff
   Do not do the line-by-line analysis yourself in the main conversation — that's what the
   subagent is for. Keeping it isolated stops a noisy review from crowding out the rest of this
   session.

4. **Relay results.** The subagent reports findings via ReportFindings. Turn that into a short
   summary for the user: one paragraph on overall risk level, then findings most-severe first,
   each with its evidence and suggested fix. Don't just dump the raw structure back at them.

5. **Verify before finishing.** Spot-check that each CONFIRMED finding actually looks reachable in
   the diff you were given — if something looks off, check it yourself rather than passing it
   through uncritically. Pay particular attention to anything the subagent flags under the
   secrets-boundary or audit-trail-snapshot invariants — those are the two categories worth
   verifying most carefully in this repo, since they're the actual security/grading surface of
   the app. This is the review's own verification step; don't skip it even though the subagent
   already claims to have verified.

## Notes

- Keep the review scoped to the diff. Pre-existing issues outside the change are out of scope
  unless the diff makes them newly relevant.
- For a very large diff, consider having the subagent review it in logical chunks (by file or by
  feature area) rather than all at once.
- If no `code-reviewer` subagent is available in the current environment, fall back to doing the
  review directly in the main conversation using the same scope/checks/rules from
  `.claude/agents/code-reviewer.md`, reporting via ReportFindings if that tool is present,
  otherwise as a structured markdown summary.
