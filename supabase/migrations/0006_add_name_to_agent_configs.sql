-- Adds a persistent display name per role, so the redesigned "Advocates &
-- Judges" summary card can read a saved name from agent_configs instead of
-- only ever seeing it in transient client draft state. Additive/nullable so
-- existing rows stay valid; PUT /api/agent-config/:role writes it going
-- forward.
alter table agent_configs add column if not exists name text;
