-- Run after 004 as the DROP:PORTAL database administrator.
begin;
alter table public.dp_personal_drops drop constraint dp_personal_drops_status_check;
alter table public.dp_personal_drops add constraint dp_personal_drops_status_check
  check(status in ('queued','running','ready','needs_research','superseded','failed'));
alter table public.dp_personal_drops add column retry_count integer not null default 0;
alter table public.dp_personal_drops add column last_retry_at timestamptz;

-- Lock in the same order as taste + schedule saves: profile, then plan.
-- A stale worker cannot queue a job after a newer schedule has been saved.
create function public.dp_queue_due_weekly(p_user uuid,p_revision bigint,p_at timestamptz,p_next timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare plan public.dp_personal_plans; profile public.dp_personal_profiles; snapshot jsonb;
begin
  select * into profile from public.dp_personal_profiles where user_id=p_user for update;
  if not found then return false; end if;
  select * into plan from public.dp_personal_plans where user_id=p_user for update;
  if not found or plan.revision<>p_revision or plan.next_drop_at<>p_at or p_at>now() then return false; end if;
  if p_next<=now() or p_next>now()+interval '8 days'
    or extract(dow from p_next at time zone 'America/Chicago')::integer<>plan.weekday
    or (p_next at time zone 'America/Chicago')::time<>plan.local_time then raise exception 'Invalid next occurrence'; end if;
  snapshot:=case when profile.target_date=(p_at at time zone 'America/Chicago')::date
    and profile.weekly_profile is not null then profile.weekly_profile else profile.base_profile end;
  insert into public.dp_personal_drops(user_id,kind,scheduled_at,profile_snapshot)
    values(p_user,'weekly',p_at,snapshot) on conflict(user_id,kind,scheduled_at) do nothing;
  update public.dp_personal_plans set next_drop_at=p_next,revision=revision+1,updated_at=now() where user_id=p_user;
  return true;
end $$;
revoke all on function public.dp_queue_due_weekly(uuid,bigint,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.dp_queue_due_weekly(uuid,bigint,timestamptz,timestamptz) to service_role;

-- Repeating the same save must not supersede the request it returns.
create or replace function public.dp_request_one_time(p_at timestamptz,p_profile jsonb)
returns setof public.dp_personal_drops language plpgsql security definer set search_path='' as $$
declare existing public.dp_personal_drops;
begin
  if auth.uid() is null then raise exception 'Unauthenticated'; end if;
  if p_at<now()-interval '1 minute' or p_at>now()+interval '30 days' or jsonb_typeof(p_profile) is distinct from 'object'
    then raise exception 'Invalid one time dig'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text),13147);
  select * into existing from public.dp_personal_drops where user_id=auth.uid() and kind='one_time' and scheduled_at=p_at;
  if found then
    if existing.status in ('queued','running','ready','needs_research','failed') then return next existing; return; end if;
    raise exception 'Choose a new time for this replacement';
  end if;
  if (select count(*) from public.dp_personal_drops where user_id=auth.uid() and kind='one_time' and created_at>now()-interval '1 hour')>=3
    then raise exception 'Too many dig requests'; end if;
  update public.dp_personal_drops set status='superseded',updated_at=now()
    where user_id=auth.uid() and kind='one_time' and status in ('queued','running','needs_research','failed');
  return query insert into public.dp_personal_drops(user_id,kind,scheduled_at,profile_snapshot) values(auth.uid(),'one_time',p_at,p_profile) returning *;
end $$;

create function public.dp_retry_personal_drop(p_id uuid) returns setof public.dp_personal_drops
language plpgsql security definer set search_path='' as $$
declare job public.dp_personal_drops;
begin
  if auth.uid() is null then raise exception 'Unauthenticated'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text),13147);
  select * into job from public.dp_personal_drops where id=p_id and user_id=auth.uid() for update;
  if not found or job.status not in ('failed','needs_research') then raise exception 'Drop cannot be retried'; end if;
  if job.retry_count>=3 or job.last_retry_at>now()-interval '5 minutes' then raise exception 'Retry limit reached'; end if;
  return query update public.dp_personal_drops set status='queued',attempts=0,retry_count=retry_count+1,
    last_retry_at=now(),status_detail='Retry requested. Saved taste and scheduled date retained.',updated_at=now()
    where id=p_id and user_id=auth.uid() returning *;
end $$;
revoke all on function public.dp_retry_personal_drop(uuid) from public,anon;
grant execute on function public.dp_retry_personal_drop(uuid) to authenticated;

-- No account data, track data or raw exception text is stored in health records.
create table public.dp_worker_runs(id uuid primary key,started_at timestamptz not null default now(),finished_at timestamptz,outcome text check(outcome in ('success','failed')));
alter table public.dp_worker_runs enable row level security;
revoke all on public.dp_worker_runs from public,anon,authenticated;
grant select,insert,update,delete on public.dp_worker_runs to service_role;
create function public.dp_start_worker_run(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  delete from public.dp_worker_runs where started_at<now()-interval '7 days';
  insert into public.dp_worker_runs(id) values(p_id);
end $$;
revoke all on function public.dp_start_worker_run(uuid) from public,anon,authenticated;
grant execute on function public.dp_start_worker_run(uuid) to service_role;
create function public.dp_worker_health() returns jsonb language plpgsql security definer set search_path='' as $$
declare latest public.dp_worker_runs;
begin
  if auth.uid() is null then raise exception 'Unauthenticated'; end if;
  select * into latest from public.dp_worker_runs order by started_at desc limit 1;
  return jsonb_build_object('lastStartedAt',latest.started_at,'lastFinishedAt',latest.finished_at,'lastOutcome',latest.outcome,
    'lastSuccessAt',(select max(finished_at) from public.dp_worker_runs where outcome='success'));
end $$;
revoke all on function public.dp_worker_health() from public,anon;
grant execute on function public.dp_worker_health() to authenticated;
commit;
