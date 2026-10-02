-- Keep one active One Time Dig per account. Ready results remain in history.
begin;

alter table public.dp_personal_drops drop constraint dp_personal_drops_status_check;
alter table public.dp_personal_drops add constraint dp_personal_drops_status_check
  check (status in ('queued','running','ready','needs_research','superseded'));

-- Cancel older unfinished requests left behind before this migration. Retain
-- their request timestamps for the existing hourly request limit.
update public.dp_personal_drops old set status='superseded',updated_at=now()
where old.kind='one_time' and old.status in ('queued','running','needs_research')
  and exists (
    select 1 from public.dp_personal_drops newer
    where newer.user_id=old.user_id and newer.kind='one_time'
      and (newer.created_at,newer.id)>(old.created_at,old.id)
  );

create or replace function public.dp_request_one_time(p_at timestamptz,p_profile jsonb)
returns setof public.dp_personal_drops language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Unauthenticated'; end if;
  if p_at<now()-interval '1 minute' or p_at>now()+interval '30 days' or jsonb_typeof(p_profile)<>'object'
    then raise exception 'Invalid one time dig'; end if;
  -- Serialize replacements for this owner even when two devices save together.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text),13147);
  if (select count(*) from public.dp_personal_drops where user_id=auth.uid()
      and kind='one_time' and created_at>now()-interval '1 hour')>=3
    then raise exception 'Too many dig requests'; end if;
  update public.dp_personal_drops set status='superseded',updated_at=now()
    where user_id=auth.uid() and kind='one_time' and status in ('queued','running','needs_research');
  return query insert into public.dp_personal_drops(user_id,kind,scheduled_at,profile_snapshot)
    values(auth.uid(),'one_time',p_at,p_profile)
    on conflict(user_id,kind,scheduled_at) do update set updated_at=public.dp_personal_drops.updated_at
    returning *;
end $$;

revoke all on function public.dp_request_one_time(timestamptz,jsonb) from public,anon;
grant execute on function public.dp_request_one_time(timestamptz,jsonb) to authenticated;
commit;
