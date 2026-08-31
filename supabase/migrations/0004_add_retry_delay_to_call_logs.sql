-- Adds retry-timing visibility to the audit trail: the backoff delay actually
-- waited before this attempt fired (0 for attempt 1). Additive/nullable so
-- existing rows stay valid. See lib/orchestrator/run.ts's backoffDelayMs().
alter table call_logs add column if not exists retry_delay_ms integer;
