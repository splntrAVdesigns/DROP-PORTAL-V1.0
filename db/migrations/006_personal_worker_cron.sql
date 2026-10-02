-- First enable Cron and pg_net in Supabase Integrations.
-- In Supabase Vault create a secret named drop_portal_worker_secret, with the
-- SAME value as DROP_PORTAL_WORKER_SECRET in Vercel. Never paste it into this file.
begin;
do $$begin
  if (select count(*) from vault.decrypted_secrets where name='drop_portal_worker_secret' and length(decrypted_secret)>=32)<>1
    then raise exception 'Create exactly one Vault secret named drop_portal_worker_secret (32+ characters) first'; end if;
end $$;
select cron.schedule('dp-personal-worker','*/5 * * * *',$job$
  select net.http_post(
    url:='https://drop-portal-v1-0.vercel.app/api/personal-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
      (select decrypted_secret from vault.decrypted_secrets where name='drop_portal_worker_secret')),
    body:='{}'::jsonb,timeout_milliseconds:=65000
  );
$job$);
commit;
-- Cron History confirms dispatch, not HTTP success. Confirm worker completion
-- through the personal dashboard heartbeat and Vercel logs (HTTP 200).
