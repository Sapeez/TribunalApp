// GET /api/cases/:id — full detail for one case: text, advocate outputs,
// verdicts, totals. Also used for polling a still-running case (§13.1). §8.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ALL_ROLES, MAX_ATTEMPTS_PER_CALL, type AgentRole } from "@/lib/constants";
import { NON_RETRYABLE_CODES, type ErrorCode } from "@/lib/toastMessages";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseClient();

  const [
    { data: caseRow, error: caseError },
    { data: advocateOutputs, error: advError },
    { data: verdicts, error: verError },
    { data: callLogs, error: logsError },
  ] = await Promise.all([
    supabase.from("cases").select("*").eq("id", id).single(),
    supabase.from("advocate_outputs").select("*").eq("case_id", id).order("role"),
    supabase.from("verdicts").select("*").eq("case_id", id).order("role"),
    supabase.from("call_logs").select("role, duration_ms, attempt_number, error_code").eq("case_id", id),
  ]);

  if (caseError) {
    return NextResponse.json({ error: caseError.message }, { status: 404 });
  }
  if (advError || verError || logsError) {
    return NextResponse.json({ error: (advError ?? verError ?? logsError)?.message }, { status: 500 });
  }

  // Aggregate total duration per role (summing all retry attempts), and the
  // highest attempt number logged so far per role (plus that attempt's
  // classification code, for the live "retrying" toast).
  const durationByRole: Record<string, number> = {};
  const maxAttemptByRole: Record<string, number> = {};
  const lastErrorCodeByRole: Record<string, ErrorCode> = {};
  for (const log of callLogs ?? []) {
    if (log.role) {
      durationByRole[log.role] = (durationByRole[log.role] ?? 0) + (log.duration_ms ?? 0);
      if ((log.attempt_number ?? 0) >= (maxAttemptByRole[log.role] ?? 0)) {
        maxAttemptByRole[log.role] = log.attempt_number ?? 0;
        if (log.error_code) lastErrorCodeByRole[log.role] = log.error_code as ErrorCode;
      }
    }
  }

  const advocateOutputsWithDuration = (advocateOutputs ?? []).map((row) => ({
    ...row,
    duration_ms: durationByRole[row.role] ?? null,
  }));
  const verdictsWithDuration = (verdicts ?? []).map((row) => ({
    ...row,
    duration_ms: durationByRole[row.role] ?? null,
  }));

  // A role is "retrying" while the run is still going, it has at least one
  // logged attempt, but no final advocate_outputs/verdicts row yet — i.e.
  // attempt N failed and the next attempt (or backoff before it) is in
  // flight. Rows exist only once attemptWithRetries fully settles, so this
  // is the only way to surface mid-retry progress to the poller. A
  // non-retryable code (auth/bad_request) means attemptWithRetries already
  // stopped after that attempt — don't show it as still retrying just
  // because its final row hasn't landed yet.
  const retrying: Partial<Record<AgentRole, { attempt: number; maxAttempts: number; code: ErrorCode }>> = {};
  if (caseRow?.status === "running") {
    const finalRoles = new Set([...(advocateOutputs ?? []), ...(verdicts ?? [])].map((r) => r.role));
    for (const role of ALL_ROLES) {
      const attemptsSoFar = maxAttemptByRole[role] ?? 0;
      const lastCode = lastErrorCodeByRole[role];
      if (
        !finalRoles.has(role) &&
        attemptsSoFar > 0 &&
        attemptsSoFar < MAX_ATTEMPTS_PER_CALL &&
        !(lastCode && NON_RETRYABLE_CODES.has(lastCode))
      ) {
        retrying[role] = {
          attempt: attemptsSoFar + 1,
          maxAttempts: MAX_ATTEMPTS_PER_CALL,
          code: lastCode ?? "unknown",
        };
      }
    }
  }

  return NextResponse.json({
    case: caseRow,
    advocateOutputs: advocateOutputsWithDuration,
    verdicts: verdictsWithDuration,
    retrying,
  });
}
