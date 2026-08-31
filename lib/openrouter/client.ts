// The single point of contact with OpenRouter. This is the ONLY file that ever
// reads OPENROUTER_API_KEY — nothing else in the codebase should touch
// process.env.OPENROUTER_API_KEY directly. Server-side only: this file must
// never be imported from client ("use client") code.
//
// Per TRIBUNAL_REQUIREMENTS.md §11 (trust boundary): the key is never included
// in any response body, never logged, never passed to the browser in any form.

import OpenAI from "openai";

let client: OpenAI | null = null;

/**
 * Lazily-constructed singleton OpenRouter client, using OpenRouter's
 * OpenAI-compatible API. Throws clearly (not silently) if the key is missing,
 * so a misconfigured deployment fails loudly at first use rather than
 * producing confusing downstream errors.
 */
export function getOpenRouterClient(): OpenAI {
  if (client) return client;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Locally: copy .env.example to .env.local " +
        "and paste your key in. On Vercel: Project Settings -> Environment " +
        "variables -> add OPENROUTER_API_KEY. See SETUP.md."
    );
  }

  client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      // OpenRouter uses these to attribute usage in its own dashboard —
      // harmless to include, not secret, feel free to change the URL/title.
      "HTTP-Referer": process.env.SITE_URL ?? "https://localhost:3000",
      "X-Title": "The Tribunal",
    },
  });

  return client;
}

export interface CallModelParams {
  model: string;
  systemPrompt: string;
  /** Already-flattened text, OR content blocks for prompt-caching later — kept
   * as `string` for now since caching is out of scope for v1 (see
   * TRIBUNAL_REQUIREMENTS.md §14). */
  userMessage: string;
  maxTokens: number;
}

export interface CallModelResult {
  text: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  /** Best-effort — not every OpenRouter provider returns cost. */
  costUsd: number | null;
}

/**
 * One non-conversational chat.completion call. No retry logic here on
 * purpose — retries are an orchestration concern (lib/orchestrator/), this
 * file only knows how to make ONE call and report what genuinely came back.
 * A malformed/missing `usage` object is surfaced as nulls, never guessed —
 * the caller decides whether that counts as a failed attempt
 * (see TRIBUNAL_REQUIREMENTS.md §4.1 / call_logs schema §7).
 */
export async function callModel(params: CallModelParams): Promise<CallModelResult> {
  const openrouter = getOpenRouterClient();

  const response = await openrouter.chat.completions.create({
    model: params.model,
    max_tokens: params.maxTokens,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userMessage },
    ],
    // Ask OpenRouter to include real usage data on the response —
    // never estimate tokens/cost client-side (see TRIBUNAL_REQUIREMENTS.md §5).
    // Some curated-pool models default to spending completion tokens on hidden
    // chain-of-thought before writing the visible answer — with the 700/1300
    // token caps in §11, that reasoning can consume the whole budget and leave
    // `content` empty. Disabling it keeps max_tokens going to the actual answer.
    // Both `usage.include` and `reasoning` are OpenRouter extensions not in the
    // official OpenAI SDK types, hence the cast below.
    usage: { include: true },
    reasoning: { enabled: false },
  } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
    usage: { include: boolean };
    reasoning: { enabled: boolean };
  },
  // Without a timeout, a stalled provider hangs this call forever, which in
  // turn blocks the whole 2-stage pipeline (stage 2 waits on all of stage 1).
  // 45s gives real generations room while still failing fast enough for a
  // retry (lib/orchestrator/run.ts) to run within a sane request lifetime.
  { timeout: 45_000 });

  const text = response.choices?.[0]?.message?.content ?? "";
  const usage = response.usage as
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number }
    | undefined;

  return {
    text,
    promptTokens: usage?.prompt_tokens ?? null,
    completionTokens: usage?.completion_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
    costUsd: usage?.cost ?? null,
  };
}
