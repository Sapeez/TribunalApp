// GET /api/agent-config — all 7 roles' current config. §8.
import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DB_READ_FAILED } from "@/lib/toastMessages";

export const runtime = "nodejs";

export async function GET() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("agent_configs").select("*").order("role");

  if (error) {
    // Never echo the raw Postgrest error to the browser (specs/security-boundary.md).
    console.error("[GET /api/agent-config] query failed:", error.message);
    return NextResponse.json({ error: DB_READ_FAILED }, { status: 500 });
  }

  return NextResponse.json({ agents: data });
}
