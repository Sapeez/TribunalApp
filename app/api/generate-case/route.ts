// POST /api/generate-case — AI-drafted case + cast, §5 of the dashboard
// redesign plan, expanded per docs/plans/advocates-judges-avatar-list.md §3.
// A sibling of the dossier-extraction flow (app/api/extract/route.ts): same
// human-review philosophy (draft-only, never auto-saved) and the same
// 15-field schema (lib/caseFields.ts) — this call now drafts the case text
// AND casts 2 defense / 2 prosecution / 3 judges into it (name + system
// prompt each), not case text alone.
// Logged separately as call_type: 'case-generation' in call_logs (case_id
// null — no case exists yet), NOT counted among the 7-call audit trail.
// One attempt, no retry — this is a convenience generator, not part of the
// scored pipeline.
import { NextResponse } from "next/server";
import { callModel } from "@/lib/openrouter/client";
import { getSupabaseClient } from "@/lib/supabase/client";
import { CASE_GENERATION_FAILED, caseGenerationMessage } from "@/lib/toastMessages";
import { CASE_GENERATION_MAX_TOKENS } from "@/lib/constants";
import { CASE_FIELDS_SCHEMA, extractJson, validateCaseFields } from "@/lib/caseFields";

export const runtime = "nodejs";

const CASE_GENERATION_SYSTEM_PROMPT = `You draft an original courtroom-simulation case AND cast 7 participants into it: 2 defense counsel, 2 prosecutors, and 3 judges.

Return ONLY a JSON object with exactly these 15 keys, each a non-empty string: caseText, defense1, defense1Name, defense2, defense2Name, prosecution1, prosecution1Name, prosecution2, prosecution2Name, judge1, judge1Name, judge2, judge2Name, judge3, judge3Name.

Key meanings:
- caseText: a self-contained charge-sheet case, roughly 250-350 words, in this shape and order: (1) a one-line case title (e.g. "Case: The State v. [Defendant]"); (2) who is accused, of what act, in one or two sentences; (3) enough background for a reader unfamiliar with the situation to follow the dispute; (4) an "Agreed facts" section — a short list of facts both sides accept as true, deliberately leaving room for genuine legal disagreement about how those facts should be judged; (5) a single precise legal/ethical question the judges must decide, phrased as an "ISSUE:" line. The case must be original, morally ambiguous enough to support a real defense and a real prosecution, and free of real people's names or any real ongoing legal matter.
- defense1 / defense2: a full character/system-prompt profile for each defense-side participant — their identity, legal philosophy, and argumentation style, written as instructions to that character (e.g. "You are [Name], a defense attorney known for...").
- defense1Name / defense2Name: that character's short display name.
- prosecution1 / prosecution2: same shape as defense1/defense2, for the two prosecution-side participants.
- prosecution1Name / prosecution2Name: short display names for the prosecution participants.
- judge1 / judge2 / judge3: a full profile for each of the three judges — background, legal philosophy, decision-making approach — written as instructions to that judge.
- judge1Name / judge2Name / judge3Name: short display name for each judge.

Important rules:
1. Every one of the 15 fields must be non-empty — never leave a name or profile blank, and never invent a person, do not use real people's names for any of the 7 characters.
2. Keep each character's profile self-contained and free of real people's names or real ongoing legal matters, same as the case text.`;

export async function POST() {
  const supabase = getSupabaseClient();
  const startedAt = new Date();
  // Fixed, not user-selectable — same reliability rationale as extraction:
  // structured 15-key JSON output needs a model that honors response_format
  // reliably (lib/openrouter/client.ts's responseFormat param).
  const model = "openai/gpt-4o-mini";
  const userMessage = "Pick any original scenario.";

  try {
    const result = await callModel({
      model,
      systemPrompt: CASE_GENERATION_SYSTEM_PROMPT,
      userMessage,
      maxTokens: CASE_GENERATION_MAX_TOKENS,
      responseFormat: CASE_FIELDS_SCHEMA,
    });
    const finishedAt = new Date();

    const parsed = extractJson(result.text) as Record<string, string>;
    const { success, emptyKeys, oversizedKeys } = validateCaseFields(parsed);

    await supabase.from("call_logs").insert({
      case_id: null,
      role: null,
      call_type: "case-generation",
      attempt_number: 1,
      model,
      system_prompt: CASE_GENERATION_SYSTEM_PROMPT,
      max_tokens: CASE_GENERATION_MAX_TOKENS,
      user_message: userMessage,
      status: success ? "success" : "failed",
      output: result.text || null,
      error_message: !success
        ? [
            emptyKeys.length > 0 ? `Missing/empty fields: ${emptyKeys.join(", ")}` : null,
            oversizedKeys.length > 0 ? `Fields over length cap: ${oversizedKeys.join(", ")}` : null,
          ]
            .filter(Boolean)
            .join("; ")
        : null,
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
      total_tokens: result.totalTokens,
      cost_usd: result.costUsd,
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
    });

    if (!success) {
      return NextResponse.json(
        {
          error: caseGenerationMessage("incomplete"),
          emptyFields: emptyKeys,
          oversizedFields: oversizedKeys,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ fields: parsed });
  } catch (err) {
    const finishedAt = new Date();
    await supabase.from("call_logs").insert({
      case_id: null,
      role: null,
      call_type: "case-generation",
      attempt_number: 1,
      model,
      system_prompt: CASE_GENERATION_SYSTEM_PROMPT,
      max_tokens: CASE_GENERATION_MAX_TOKENS,
      user_message: userMessage,
      status: "failed",
      output: null,
      error_message: err instanceof Error ? err.message : String(err),
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      cost_usd: null,
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
    });

    console.error("[POST /api/generate-case] generation call failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: CASE_GENERATION_FAILED }, { status: 502 });
  }
}
