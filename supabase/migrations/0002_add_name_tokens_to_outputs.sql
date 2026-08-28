-- Add name, total_tokens, cost_usd to advocate_outputs and verdicts.
-- name:         The display name of the agent at run time (populated from the
--               uploaded dossier or entered manually — replaces hardcoded defaults).
-- total_tokens: Tokens consumed by the successful call for this role.
-- cost_usd:     USD cost of the successful call for this role.
-- All columns are nullable so existing rows remain valid.

ALTER TABLE advocate_outputs
  ADD COLUMN IF NOT EXISTS name         text,
  ADD COLUMN IF NOT EXISTS total_tokens integer,
  ADD COLUMN IF NOT EXISTS cost_usd     numeric(10,6);

ALTER TABLE verdicts
  ADD COLUMN IF NOT EXISTS name         text,
  ADD COLUMN IF NOT EXISTS total_tokens integer,
  ADD COLUMN IF NOT EXISTS cost_usd     numeric(10,6);
