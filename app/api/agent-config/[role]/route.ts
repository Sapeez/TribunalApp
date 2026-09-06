// PUT /api/agent-config/:role — update one role's config. §8.
// Server clamps max_tokens to the hard cap and rejects below the hard floor
// regardless of what's sent (§11).
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ALL_ROLES, CURATED_MODELS, maxTokensCapFor, minTokensFloorFor, type AgentRole } from "@/lib/constants";
import { DB_WRITE_FAILED } from "@/lib/toastMessages";

export const runtime = "nodejs";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;

  if (!ALL_ROLES.includes(role as AgentRole)) {
    return NextResponse.json({ error: `Unknown role: ${role}` }, { status: 400 });
  }

  const body = await request.json();
  const { model, systemPrompt, maxTokens, name } = body as {
    model?: string;
    systemPrompt?: string;
    maxTokens?: number;
    name?: string;
  };

  if (!model || typeof model !== "string") {
    return NextResponse.json({ error: "model is required" }, { status: 400 });
  }
  if (!CURATED_MODELS.some((m) => m.id === model)) {
    return NextResponse.json({ error: `Unknown model: ${model}` }, { status: 400 });
  }
  if (typeof systemPrompt !== "string") {
    return NextResponse.json({ error: "systemPrompt is required" }, { status: 400 });
  }
  if (typeof maxTokens !== "number" || maxTokens <= 0) {
    return NextResponse.json({ error: "maxTokens must be a positive number" }, { status: 400 });
  }
  const minTokens = minTokensFloorFor(role as AgentRole);
  if (maxTokens < minTokens) {
    return NextResponse.json(
      { error: `maxTokens must be at least ${minTokens} for this role` },
      { status: 400 }
    );
  }
  if (name !== undefined && typeof name !== "string") {
    return NextResponse.json({ error: "name must be a string" }, { status: 400 });
  }

  const clampedMaxTokens = Math.min(maxTokens, maxTokensCapFor(role as AgentRole));

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("agent_configs")
    .update({
      model,
      system_prompt: systemPrompt,
      max_tokens: clampedMaxTokens,
      ...(name !== undefined ? { name } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("role", role)
    .select()
    .single();

  if (error) {
    // Never echo the raw Postgrest error to the browser (specs/security-boundary.md).
    console.error(`[PUT /api/agent-config/${role}] update failed:`, error.message);
    return NextResponse.json({ error: DB_WRITE_FAILED }, { status: 500 });
  }

  return NextResponse.json({ agent: data });
}
