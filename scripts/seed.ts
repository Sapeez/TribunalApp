// Seeds `agent_configs` with the professor's 7 real prompts (§3) and the
// default model (§9). Idempotent — safe to re-run; upserts by role primary key.
// Usage: npm run seed  (requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local)
import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabaseClient } from "../lib/supabase/client";
import { AGENT_SYSTEM_PROMPTS } from "../prompts/seed-content";
import { ADVOCATE_ROLES, JUDGE_ROLES, DEFAULT_MODEL, maxTokensCapFor, type AgentRole } from "../lib/constants";

async function main() {
  const supabase = getSupabaseClient();
  const roles = [...ADVOCATE_ROLES, ...JUDGE_ROLES] as AgentRole[];

  const rows = roles.map((role) => ({
    role,
    model: DEFAULT_MODEL,
    system_prompt: AGENT_SYSTEM_PROMPTS[role],
    max_tokens: maxTokensCapFor(role),
  }));

  const { error } = await supabase.from("agent_configs").upsert(rows, { onConflict: "role" });

  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }

  console.log(`Seeded ${rows.length} agent_configs rows with default model ${DEFAULT_MODEL}.`);
}

main();
