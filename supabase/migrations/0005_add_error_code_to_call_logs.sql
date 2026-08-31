-- Adds the classification code (see lib/openrouter/errors.ts's ErrorCode)
-- alongside the existing free-text error_message, so GET /api/cases/:id can
-- tell the browser *which* kind of failure a still-retrying role hit (used to
-- compose the live "retrying" toast — lib/toastMessages.ts's
-- agentRetryMessage) without parsing the message text. Additive/nullable so
-- existing rows stay valid.
alter table call_logs add column if not exists error_code text;
