-- Add completion_tokens to advocate_outputs and verdicts so the UI can show
-- an apples-to-apples "max_tokens vs completion_tokens" comparison instead of
-- comparing the completion cap against total_tokens (prompt + completion).
-- Nullable so existing rows remain valid.

ALTER TABLE advocate_outputs
  ADD COLUMN IF NOT EXISTS completion_tokens integer;

ALTER TABLE verdicts
  ADD COLUMN IF NOT EXISTS completion_tokens integer;
