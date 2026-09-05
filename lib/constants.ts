// Shared types + constants used across the orchestrator, API routes, and UI.
// Per TRIBUNAL_REQUIREMENTS.md §9 (curated model pool) and §11 (max_tokens caps).

export type AgentRole =
  | "defense-1"
  | "defense-2"
  | "prosecution-1"
  | "prosecution-2"
  | "judge-1"
  | "judge-2"
  | "judge-3";

export const ADVOCATE_ROLES: AgentRole[] = ["defense-1", "defense-2", "prosecution-1", "prosecution-2"];
export const JUDGE_ROLES: AgentRole[] = ["judge-1", "judge-2", "judge-3"];
export const ALL_ROLES: AgentRole[] = [...ADVOCATE_ROLES, ...JUDGE_ROLES];

export function isAdvocate(role: AgentRole): boolean {
  return ADVOCATE_ROLES.includes(role);
}

export function stanceOf(role: AgentRole): "defense" | "prosecution" | null {
  if (role === "defense-1" || role === "defense-2") return "defense";
  if (role === "prosecution-1" || role === "prosecution-2") return "prosecution";
  return null;
}

// Hard server-side caps, enforced at save-time (PUT /api/agent-config/:role) and
// call-time (orchestrator), regardless of what the browser sends. §11.
export const MAX_TOKENS_CAP: Record<"advocate" | "judge", number> = {
  advocate: 1300,
  judge: 2000,
};

export function maxTokensCapFor(role: AgentRole): number {
  return isAdvocate(role) ? MAX_TOKENS_CAP.advocate : MAX_TOKENS_CAP.judge;
}

// Hard server-side floors, enforced at save-time (PUT /api/agent-config/:role) and
// call-time (orchestrator). Below this, a completion can't fit a coherent argument
// (advocate) or a reasoned opinion reviewing all 4 arguments (judge) — the app would
// be shipping a call it already knows will be truncated into nonsense.
export const MIN_TOKENS_FLOOR: Record<"advocate" | "judge", number> = {
  advocate: 300,
  judge: 400,
};

export function minTokensFloorFor(role: AgentRole): number {
  return isAdvocate(role) ? MIN_TOKENS_FLOOR.advocate : MIN_TOKENS_FLOOR.judge;
}

// Cost-optimized 7-model curated pool, §9. Kept server-side only — the browser
// gets this via GET /api/models, never hardcodes it itself.
//
// `tier` is a qualitative, static price-band label — NOT a per-run dollar
// estimate. Actual cost only ever comes from OpenRouter's real `usage.cost`
// on a response (lib/openrouter/client.ts); a pre-run dollar figure would be
// a guess, which the audit trail explicitly never allows (see invariant #4).
export type ModelTier = "budget" | "standard" | "premium";

export interface CuratedModel {
  id: string;
  label: string;
  tier: ModelTier;
}

export const CURATED_MODELS: CuratedModel[] = [
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash (cheapest, default)", tier: "budget" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini", tier: "budget" },
  { id: "tencent/hy3-preview", label: "Hunyuan HY3 Preview", tier: "budget" },
  { id: "minimax/minimax-m3", label: "MiniMax M3", tier: "standard" },
  { id: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B Instruct", tier: "standard" },
  { id: "anthropic/claude-3-haiku", label: "Claude 3 Haiku", tier: "standard" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "premium" },
];

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "deepseek/deepseek-v4-flash";

// §5 of the redesign plan, expanded per docs/plans/advocates-judges-avatar-list.md
// §3: a one-shot "generate a case with AI" call — not part of the scored
// 7-call pipeline — that now drafts case text AND the 7 role names/profiles
// (lib/caseFields.ts's 15-field schema), matching /api/extract's budget for
// the same shape (~2000-3000 tokens typical, generous headroom below). Not
// retried, so a truncated draft is just an annoyance, not an audit problem.
export const CASE_GENERATION_MAX_TOKENS = 4500;

// §4.1: a failed call retries up to 2 more times (3 attempts total), run-wide
// ceiling of 21 attempts (7 x 3).
export const MAX_ATTEMPTS_PER_CALL = 3;
export const MAX_ATTEMPTS_PER_RUN = 21;

export const UNAVAILABLE_MARKER = "[unavailable — this call failed]";
