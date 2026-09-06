// The single centralized copy map for every human-facing failure/status
// message in the app — server-stored (advocate_outputs/verdicts.error_message,
// API error bodies) and client-rendered (toasts) alike. Per
// docs/toast-message-copy.md's rule: two-part "what happened, what's next"
// sentences, plain language, the specific role named where the failure is
// per-agent, calm tone, never a secret.
//
// Deliberately dependency-free (no "openai", no Supabase) so it can be
// imported from both server code (lib/orchestrator/run.ts) and "use client"
// code (app/page.tsx) without pulling server-only packages into the browser
// bundle. `ErrorCode` is defined here — lib/openrouter/errors.ts imports it,
// not the other way around.

export type ErrorCode =
  | "auth"
  | "rate_limit"
  | "provider_down"
  | "network"
  | "bad_request"
  | "no_usage"
  | "empty_content"
  | "unknown";

// Single source of truth for "can retrying this code ever help" — both
// lib/openrouter/errors.ts's classifyError() and app/api/cases/[id]/route.ts's
// live "retrying" computation must agree, or a role that already failed fast
// (auth/bad_request, stopped after attempt 1) can be shown as still retrying
// in the window between its call_logs row landing and its final
// advocate_outputs/verdicts row landing.
export const NON_RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set(["auth", "bad_request"]);

/** A role/agent hit a retryable failure and is about to try again. */
export function agentRetryMessage(ctx: {
  roleLabel: string;
  code: ErrorCode;
  nextAttempt: number;
  maxAttempts: number;
}): string {
  const { roleLabel, code, nextAttempt, maxAttempts } = ctx;
  switch (code) {
    case "provider_down":
      return `${roleLabel} couldn't reach the model provider. Retrying (attempt ${nextAttempt} of ${maxAttempts}).`;
    case "rate_limit":
      return `${roleLabel} hit a rate limit. Retrying shortly.`;
    case "network":
      return `${roleLabel}'s request didn't go through. Retrying.`;
    default:
      return `${roleLabel} hit an issue. Retrying (attempt ${nextAttempt} of ${maxAttempts}).`;
  }
}

/** A role/agent's call reached its final outcome for this run (exhausted retries, or failed fast on a non-retryable error). */
export function agentFailureMessage(ctx: { roleLabel: string; code: ErrorCode; maxAttempts: number }): string {
  const { roleLabel, code, maxAttempts } = ctx;
  if (code === "auth") {
    // A global config problem, not this agent's fault specifically — no role prefix.
    return "The connection to the model provider isn't set up correctly. Fix itin the app's settings";
  }
  if (code === "bad_request") {
    return `${roleLabel}'s configuration was rejected by the model provider. Check its model/max-tokens settings.`;
  }
  switch (code) {
    case "provider_down":
    case "rate_limit":
    case "network":
      return `${roleLabel} failed after ${maxAttempts} attempts. The model provider may be down. Try again later.`;
    default:
      return `${roleLabel} couldn't complete after ${maxAttempts} attempts. Check the audit log, or try again.`;
  }
}

/** The model call succeeded but its result couldn't be written to the database (see lib/orchestrator/run.ts's retryWrite). */
export function writeFailedMessage(roleLabel: string): string {
  return `${roleLabel}'s response came back but couldn't be saved. This may need a re-run to be recorded correctly.`;
}

// Defensive fallbacks for the (should-never-happen) case where the poll
// response is missing the data a live toast would normally use — still
// centralized here rather than inline at the call site, per the rule.
export function agentRetryingFallback(roleLabel: string): string {
  return `${roleLabel} is retrying.`;
}

export function agentFailedFallback(roleLabel: string): string {
  return `${roleLabel} failed.`;
}

export const DB_UNREACHABLE_AT_START =
  "Couldn't start the run: the database isn't reachable right now. Try again in a moment.";

// Generic read/write failure copy for routes that only proxy a Supabase
// query (GET /api/cases, GET /api/cases/:id, GET /api/agent-config, PUT
// /api/agent-config/:role). Per specs/security-boundary.md's "no raw
// internal error text" rule, the real Postgrest error is logged server-side
// (console.error) only — never returned in the response body, since it can
// include table/column names or query internals.
export const DB_READ_FAILED =
  "Couldn't load that data: the database isn't reachable right now. Try again in a moment.";

export const DB_WRITE_FAILED =
  "Couldn't save that change: the database isn't reachable right now. Try again in a moment.";

export const CASE_NOT_FOUND = "That case couldn't be found.";

export const RUN_ALREADY_ACTIVE = "This case is already running.";

export const PDF_READ_FAILED =
  "Couldn't read that PDF: it may be corrupted, scanned-image-only, or password protected. Try another file or enter fields manually.";

// §5 of the redesign plan: "Generate case with AI" is a one-shot convenience
// call, not part of the scored pipeline — no retry, so no attempt-count
// variant is needed here.
export const CASE_GENERATION_FAILED = "Couldn't generate a case right now. You can still write one yourself.";

export type CaseGenerationFailureKind = "incomplete";

// Mirrors uploadMessage() below — generation now drafts the full 7-role cast
// (docs/plans/advocates-judges-avatar-list.md §3), so an incomplete result
// gets the same "reject the whole thing, review what's missing" treatment as
// a bad dossier extraction.
export function caseGenerationMessage(kind: CaseGenerationFailureKind): string {
  switch (kind) {
    case "incomplete":
      return "Couldn't draft a full cast for that case. Review and fill in what's missing below, or try again.";
  }
}

/** The "single model for all" bulk apply failed to save for one or more roles' configs. */
export function modelApplyFailedMessage(roleLabels: string[]): string {
  const list =
    roleLabels.length <= 1
      ? roleLabels.join("")
      : `${roleLabels.slice(0, -1).join(", ")} and ${roleLabels[roleLabels.length - 1]}`;
  const pronoun = roleLabels.length > 1 ? "their previous models are" : "its previous model is";
  return `Couldn't apply the new model to ${list}, ${pronoun} still in effect there. Try again.`;
}

/** A single row's model/max-tokens/name edit (PUT /api/agent-config/:role) failed to save. */
export function roleConfigSaveFailedMessage(roleLabel: string): string {
  return `Couldn't save that change for ${roleLabel}, it wasn't applied. Try again.`;
}

export type UploadFailureKind = "wrong_type" | "too_large" | "incomplete" | "extraction_failed";

export function uploadMessage(kind: UploadFailureKind): string {
  switch (kind) {
    case "wrong_type":
      return "Only PDF files are supported.";
    case "too_large":
      return "That file is larger than 5 MB — try a smaller file.";
    case "incomplete":
      return "Couldn't pull all the fields from that document — review and fill in what's missing below.";
    case "extraction_failed":
      return "Couldn't process that document right now. You can still fill in the case fields by hand.";
  }
}
