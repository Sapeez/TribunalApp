// GET /api/agent-config — all 7 roles' current config. §8.
import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase/client";

export const runtime = "nodejs";

export async function GET() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("agent_configs").select("*").order("role");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agents: data });
}
