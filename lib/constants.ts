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
  judge: 700,
};

export function maxTokensCapFor(role: AgentRole): number {
  return isAdvocate(role) ? MAX_TOKENS_CAP.advocate : MAX_TOKENS_CAP.judge;
}

// Cost-optimized 7-model curated pool, §9. Kept server-side only — the browser
// gets this via GET /api/models, never hardcodes it itself.
export interface CuratedModel {
  id: string;
  label: string;
}

export const CURATED_MODELS: CuratedModel[] = [
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash (cheapest, default)" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini" },
  { id: "tencent/hy3-preview", label: "Hunyuan HY3 Preview" },
  { id: "minimax/minimax-m3", label: "MiniMax M3" },
  { id: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B Instruct" },
  { id: "anthropic/claude-3-haiku", label: "Claude 3 Haiku" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
];

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "deepseek/deepseek-v4-flash";

// §4.1: a failed call retries up to 2 more times (3 attempts total), run-wide
// ceiling of 21 attempts (7 x 3).
export const MAX_ATTEMPTS_PER_CALL = 3;
export const MAX_ATTEMPTS_PER_RUN = 21;

export const UNAVAILABLE_MARKER = "[unavailable — this call failed]";
