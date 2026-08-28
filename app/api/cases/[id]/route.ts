// GET /api/cases/:id — full detail for one case: text, advocate outputs,
// verdicts, totals. Also used for polling a still-running case (§13.1). §8.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase/client";

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
    supabase.from("call_logs").select("role, duration_ms").eq("case_id", id),
  ]);

  if (caseError) {
    return NextResponse.json({ error: caseError.message }, { status: 404 });
  }
  if (advError || verError || logsError) {
    return NextResponse.json({ error: (advError ?? verError ?? logsError)?.message }, { status: 500 });
  }

  // Aggregate total duration per role (summing all retry attempts).
  const durationByRole: Record<string, number> = {};
  for (const log of callLogs ?? []) {
    if (log.role) {
      durationByRole[log.role] = (durationByRole[log.role] ?? 0) + (log.duration_ms ?? 0);
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

  return NextResponse.json({
    case: caseRow,
    advocateOutputs: advocateOutputsWithDuration,
    verdicts: verdictsWithDuration,
  });
}
