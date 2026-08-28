-- The Tribunal — initial schema, per TRIBUNAL_REQUIREMENTS.md §7.
-- Run this once against your Supabase project (SQL editor, or `supabase db push`).

create extension if not exists pgcrypto;

create table if not exists agent_configs (
  role          text primary key,   -- 'defense-1' | 'defense-2' | 'prosecution-1' | 'prosecution-2'
                                     -- | 'judge-1' | 'judge-2' | 'judge-3'
  model         text not null,
  system_prompt text not null,
  max_tokens    integer not null,
  updated_at    timestamptz not null default now()
);

create table if not exists cases (
  id              uuid primary key default gen_random_uuid(),
  case_text       text not null,
  submitted_at    timestamptz not null default now(),
  status          text not null default 'running', -- running | complete | partial-failure | failed
  total_tokens    integer,          -- null until the run finishes
  total_cost_usd  numeric(10,6),
  total_time_ms   integer
);
create index if not exists cases_submitted_at_idx on cases (submitted_at desc);

create table if not exists advocate_outputs (
  id             uuid primary key default gen_random_uuid(),
  case_id        uuid not null references cases(id) on delete cascade,
  role           text not null,
  stance         text not null,     -- 'defense' | 'prosecution'
  model          text not null,     -- frozen at call time
  system_prompt  text not null,     -- frozen at call time
  max_tokens     integer not null,
  output         text,              -- null if the call failed after all retries
  failed         boolean not null default false,
  error_message  text,
  created_at     timestamptz not null default now(),
  unique (case_id, role)
);

create table if not exists verdicts (
  id             uuid primary key default gen_random_uuid(),
  case_id        uuid not null references cases(id) on delete cascade,
  role           text not null,
  model          text not null,
  system_prompt  text not null,
  max_tokens     integer not null,
  output         text,
  verdict_label  text,              -- best-effort parsed, null if trailer didn't match
  reasons        text[],            -- best-effort parsed
  failed         boolean not null default false,
  error_message  text,
  created_at     timestamptz not null default now(),
  unique (case_id, role)
);

create table if not exists call_logs (
  id                uuid primary key default gen_random_uuid(),
  case_id           uuid references cases(id) on delete cascade, -- nullable: an 'extraction' call
                                                                  -- happens at upload time, before a
                                                                  -- case row necessarily exists
  role              text,             -- null for 'extraction' rows (not tied to one of the 7 roles)
  call_type         text not null,   -- 'advocate' | 'judge' | 'extraction'
  attempt_number    integer not null, -- 1, 2, or 3
  model             text not null,
  system_prompt     text not null,
  max_tokens        integer not null,
  user_message      text not null,
  status            text not null,   -- 'success' | 'failed'
  output            text,
  error_message     text,
  prompt_tokens     integer,
  completion_tokens integer,
  total_tokens      integer,
  cost_usd          numeric(10,6),
  duration_ms       integer not null,
  started_at        timestamptz not null,
  finished_at       timestamptz not null
);
create index if not exists call_logs_case_id_idx on call_logs (case_id);

-- Defense-in-depth per TRIBUNAL_REQUIREMENTS.md §11: the browser never talks to
-- Supabase directly, and the backend only ever uses the service-role key
-- (which bypasses RLS regardless). Enabling RLS with zero policies just means
-- the anon/public key — never used by this app — can't read or write anything.
alter table agent_configs enable row level security;
alter table cases enable row level security;
alter table advocate_outputs enable row level security;
alter table verdicts enable row level security;
alter table call_logs enable row level security;
