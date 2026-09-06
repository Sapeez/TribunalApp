// GET /api/cases — past-runs list, most recent first, terminal statuses only. §8.
// Supports ?limit=N&offset=M for pagination (defaults: limit=10, offset=0).
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DB_READ_FAILED } from "@/lib/toastMessages";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? DEFAULT_LIMIT)), MAX_LIMIT);
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));

  const supabase = getSupabaseClient();

  // Fetch one extra row beyond the page to detect whether more results exist.
  const { data, error } = await supabase
    .from("cases")
    .select("id, case_text, submitted_at, status, total_tokens, total_cost_usd, total_time_ms")
    .in("status", ["complete", "partial-failure", "failed"])
    .order("submitted_at", { ascending: false })
    .range(offset, offset + limit); // range is inclusive on both ends, so +limit gives limit+1 rows

  if (error) {
    // Never echo the raw Postgrest error to the browser (specs/security-boundary.md) —
    // it can include table/column names or query internals.
    console.error("[GET /api/cases] query failed:", error.message);
    return NextResponse.json({ error: DB_READ_FAILED }, { status: 500 });
  }

  const hasMore = (data?.length ?? 0) > limit;
  const cases = hasMore ? data!.slice(0, limit) : (data ?? []);

  return NextResponse.json({ cases, hasMore });
}
