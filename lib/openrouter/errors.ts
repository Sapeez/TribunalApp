// Error classification for OpenRouter calls — decides, for every thrown or
// implied failure, whether another attempt could plausibly help. This is
// deliberately *only* classification: the human-facing copy for each code
// lives in lib/toastMessages.ts (the one centralized error-copy map, per
// docs/toast-message-copy.md), not here — keeps "did this fail, and can a
// retry fix it" separate from "what does the user see."
import {
  APIConnectionError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";
import { NON_RETRYABLE_CODES, type ErrorCode } from "@/lib/toastMessages";

export type { ErrorCode };

export interface ClassifiedError {
  code: ErrorCode;
  /** Whether spending another attempt could plausibly change the outcome. */
  retryable: boolean;
  /** Raw diagnostic detail — server-side only (call_logs, console.error). Never sent to the browser. */
  detail: string;
}

// Retryability is derived from NON_RETRYABLE_CODES (lib/toastMessages.ts), not
// hardcoded per-branch here — that set is also what
// app/api/cases/[id]/route.ts checks before showing a role as "retrying," so
// the two can't drift apart and show a role as still-retrying after it
// already failed fast.
function build(code: ErrorCode, detail: string): ClassifiedError {
  return { code, retryable: !NON_RETRYABLE_CODES.has(code), detail };
}

/** Classifies a thrown error from a `callModel()` call. */
export function classifyError(err: unknown): ClassifiedError {
  const detail = err instanceof Error ? err.message : String(err);

  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
    return build("auth", detail);
  }
  if (err instanceof RateLimitError) {
    return build("rate_limit", detail);
  }
  if (err instanceof InternalServerError) {
    return build("provider_down", detail);
  }
  if (err instanceof BadRequestError) {
    return build("bad_request", detail);
  }
  if (err instanceof APIConnectionError) {
    return build("network", detail);
  }
  if (err instanceof APIError) {
    // Any other status this SDK didn't give a dedicated subclass for: bucket
    // by status code rather than assuming — 5xx is the provider's problem
    // (retryable), anything else is treated as a request-shape problem (not).
    const status = err.status;
    if (typeof status === "number" && status >= 500) return build("provider_down", detail);
    return build("bad_request", detail);
  }

  // Not an OpenAI-SDK error at all (e.g. a thrown string, a bug elsewhere) —
  // stay conservative and allow a retry rather than failing fast on something
  // we don't recognize.
  return build("unknown", detail);
}

/** §5: a 200 response with no real `usage` object — not a thrown error, but classified the same way. */
export function classifyNoUsage(): ClassifiedError {
  return build("no_usage", "OpenRouter response had no usage data — treated as failed.");
}

/** A 200 response with real usage but empty/missing content — some providers error inside a 200 body. */
export function classifyEmptyContent(): ClassifiedError {
  return build("empty_content", "OpenRouter response had empty content — treated as failed.");
}
