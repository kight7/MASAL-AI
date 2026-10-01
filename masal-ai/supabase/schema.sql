-- LeadLens schema (contract section 5). Safe to re-run: every statement is idempotent.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create extension if not exists pgcrypto; -- gen_random_uuid() (already enabled on Supabase; harmless if present)

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),   -- set by the server on every write
  name text not null,
  location text not null,
  property_requirement text not null,
  budget text not null,
  timeline text not null,
  message text not null,
  contact text,                                   -- optional phone or email; never sent to AI
  status text not null default 'pending' check (status in ('pending','analyzed','failed')),
  analysis jsonb,
  score int,
  tier text check (tier in ('hot','warm','cold')),
  urgent boolean not null default false,
  ai_provider text,
  error text
);

create index if not exists leads_score_idx on leads (score desc nulls last);
create index if not exists leads_created_idx on leads (created_at desc);

create table if not exists lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists lead_messages_lead_idx on lead_messages (lead_id, created_at);

-- Row Level Security: on for both tables.
alter table leads enable row level security;
alter table lead_messages enable row level security;

-- leads: public SELECT only. Realtime with the anon key needs it (demo trade-off: anyone
-- with the anon key can read leads, which is acceptable because all data is fake sample data).
drop policy if exists "leads_public_select" on leads;
create policy "leads_public_select" on leads for select to anon, authenticated using (true);

-- lead_messages: NO policies on purpose. Only the service-role key (server routes) can read or write it.
-- ALL writes to both tables go through server routes using the service-role key, which bypasses RLS.

-- Add leads to the supabase_realtime publication (guarded so re-running never errors).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table public.leads;
  end if;
end
$$;

-- Prompt 5.1 (Property Match): AI talking points for the code-picked matches.
alter table leads add column if not exists match_explanation jsonb;
alter table leads add column if not exists match_explained_at timestamptz;

-- Prompt 5.2 (Call Prep Notes): the brief and which questions were ticked.
alter table leads add column if not exists call_prep jsonb;
alter table leads add column if not exists call_prep_at timestamptz;
