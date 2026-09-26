-- Enable the pg_cron extension in Supabase Integrations > Cron first.
-- Execute as the project database administrator, after 001.
select cron.schedule('dp-learning-retention','17 3 * * *',
  $$delete from public.dp_feedback_events where occurred_at < now() - interval '180 days'$$);
-- Saved/Heard current state is retained until the owner deletes it.
-- Learning event retention is 180 days, purged daily (up to 24h purge delay).
