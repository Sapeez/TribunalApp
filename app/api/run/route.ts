// POST /api/run — kicks off the 2-stage pipeline and returns immediately with
// the case id; the browser polls GET /api/cases/:id for progress (§13.1,
// resolved: polling). The pipeline keeps running after the response via
// `after()`, so this works both in `next dev` and Netlify's Next.js runtime.
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runCase, type RunAgentInput } from "@/lib/orchestrator/run";
import { ADVOCATE_ROLES, ALL_ROLES, type AgentRole } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { caseText, agents } = body as { caseText?: string; agents?: RunAgentInput[] };

  if (!caseText || typeof caseText !== "string" || !caseText.trim()) {
    return NextResponse.json({ error: "caseText is required" }, { status: 400 });
  }
  if (!Array.isArray(agents) || agents.length === 0) {
    return NextResponse.json({ error: "agents is required" }, { status: 400 });
  }

  const byRole = new Map(agents.map((a) => [a.role, a]));
  for (const role of agents.map((a) => a.role)) {
    if (!ALL_ROLES.includes(role as AgentRole)) {
      return NextResponse.json({ error: `Unknown role: ${role}` }, { status: 400 });
    }
  }

  // All 7 agents must have a non-empty name before running.
  const missingName = agents.find((a) => !a.name?.trim());
  if (missingName) {
    return NextResponse.json(
      { error: `All agents must have a name. Missing name for: ${missingName.role}` },
      { status: 400 }
    );
  }

  // §4.1: an advocate with an empty prompt blocks Run entirely.
  const missingAdvocate = ADVOCATE_ROLES.find((role) => !byRole.get(role)?.systemPrompt?.trim());
  if (missingAdvocate) {
    return NextResponse.json(
      { error: `All 4 advocates need a system prompt to run. Missing: ${missingAdvocate}` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseClient();
  const { data: caseRow, error } = await supabase
    .from("cases")
    .insert({ case_text: caseText, status: "running" })
    .select()
    .single();

  if (error || !caseRow) {
    // §10.1: Supabase unreachable — fail before any OpenRouter calls fire.
    return NextResponse.json({ error: error?.message ?? "Failed to create case" }, { status: 502 });
  }

  after(async () => {
    try {
      await runCase(caseRow.id, caseText, agents);
    } catch (err) {
      await supabase
        .from("cases")
        .update({ status: "failed" })
        .eq("id", caseRow.id);
      console.error(`Run ${caseRow.id} crashed:`, err);
    }
  });

  return NextResponse.json({ caseId: caseRow.id }, { status: 202 });
}
