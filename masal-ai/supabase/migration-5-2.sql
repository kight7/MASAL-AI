-- Prompt 5.2 - Call Prep Notes.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
alter table leads add column if not exists call_prep jsonb;
alter table leads add column if not exists call_prep_at timestamptz;
-- Make the API see the new columns immediately.
notify pgrst, 'reload schema';
