-- Prompt 5.1 - Property Match & Cross-Sell Matrix.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
alter table leads add column if not exists match_explanation jsonb;
alter table leads add column if not exists match_explained_at timestamptz;
-- Make the API see the new columns immediately.
notify pgrst, 'reload schema';
