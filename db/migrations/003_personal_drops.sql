-- Run after 001. Personal plans and results stay in Supabase, never in the public feed.
begin;
create table public.dp_personal_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  local_time time without time zone not null,
  next_drop_at timestamptz not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
create table public.dp_personal_drops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('weekly','one_time')),
  scheduled_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued','running','ready','needs_research')),
  attempts integer not null default 0,
  profile_snapshot jsonb not null check (jsonb_typeof(profile_snapshot)='object'),
  result jsonb,
  status_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,kind,scheduled_at)
);
create index dp_personal_drops_owner_time on public.dp_personal_drops(user_id,scheduled_at desc);
create index dp_personal_drops_pending on public.dp_personal_drops(status,scheduled_at) where status='queued';
alter table public.dp_personal_plans enable row level security;
alter table public.dp_personal_drops enable row level security;
create policy plan_owner_read on public.dp_personal_plans for select to authenticated using ((select auth.uid())=user_id);
create policy drop_owner_read on public.dp_personal_drops for select to authenticated using ((select auth.uid())=user_id);
create policy plan_owner_delete on public.dp_personal_plans for delete to authenticated using ((select auth.uid())=user_id);
create policy drop_owner_delete on public.dp_personal_drops for delete to authenticated using ((select auth.uid())=user_id);
revoke all on public.dp_personal_plans,public.dp_personal_drops from anon,authenticated;
grant select on public.dp_personal_plans,public.dp_personal_drops to authenticated;
grant select,insert,update,delete on public.dp_personal_plans,public.dp_personal_drops to service_role;
grant select on public.dp_personal_profiles,public.dp_feedback to service_role;

-- Save taste and its recurring schedule in one transaction. The API calculates
-- the next America/Chicago occurrence; only the authenticated owner can call.
create function public.dp_save_personal_plan(p_base jsonb,p_weekly jsonb,p_target date,
  p_learning boolean,p_expected bigint,p_weekday integer,p_time time,p_next timestamptz)
returns setof public.dp_personal_plans language plpgsql security definer set search_path='' as $$
declare old_revision bigint;
begin
  if auth.uid() is null then raise exception 'Unauthenticated'; end if;
  if p_weekday not between 0 and 6 or p_next<=now() or p_next>now()+interval '8 days'
    or extract(dow from p_next at time zone 'America/Chicago')::integer<>p_weekday
    or (p_next at time zone 'America/Chicago')::time<>p_time then
    raise exception 'Invalid schedule';
  end if;
  insert into public.dp_personal_profiles(user_id,base_profile) values(auth.uid(),p_base) on conflict do nothing;
  select revision into old_revision from public.dp_personal_profiles where user_id=auth.uid() for update;
  if old_revision<>p_expected then raise exception 'revision_conflict' using errcode='40001'; end if;
  update public.dp_personal_profiles set base_profile=p_base,weekly_profile=p_weekly,
    target_date=p_target,learning_enabled=p_learning,revision=revision+1,updated_at=now()
    where user_id=auth.uid();
  if not p_learning then delete from public.dp_feedback_events where user_id=auth.uid(); end if;
  insert into public.dp_personal_plans(user_id,weekday,local_time,next_drop_at)
    values(auth.uid(),p_weekday,p_time,p_next)
    on conflict(user_id) do update set weekday=excluded.weekday,local_time=excluded.local_time,
      next_drop_at=excluded.next_drop_at,revision=dp_personal_plans.revision+1,updated_at=now();
  return query select * from public.dp_personal_plans where user_id=auth.uid();
end $$;
revoke all on function public.dp_save_personal_plan(jsonb,jsonb,date,boolean,bigint,integer,time,timestamptz) from public,anon;
grant execute on function public.dp_save_personal_plan(jsonb,jsonb,date,boolean,bigint,integer,time,timestamptz) to authenticated;

create function public.dp_request_one_time(p_at timestamptz,p_profile jsonb)
returns setof public.dp_personal_drops language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Unauthenticated'; end if;
  if p_at<now()-interval '1 minute' or p_at>now()+interval '30 days' or jsonb_typeof(p_profile)<>'object'
    then raise exception 'Invalid one time dig'; end if;
  if (select count(*) from public.dp_personal_drops where user_id=auth.uid()
      and kind='one_time' and created_at>now()-interval '1 hour')>=3
    then raise exception 'Too many dig requests'; end if;
  return query insert into public.dp_personal_drops(user_id,kind,scheduled_at,profile_snapshot)
    values(auth.uid(),'one_time',p_at,p_profile)
    on conflict(user_id,kind,scheduled_at) do update set updated_at=public.dp_personal_drops.updated_at
    returning *;
end $$;
revoke all on function public.dp_request_one_time(timestamptz,jsonb) from public,anon;
grant execute on function public.dp_request_one_time(timestamptz,jsonb) to authenticated;

-- Clear taste also removes private scheduling and drops.
create or replace function public.dp_clear_personal_data() returns void language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Unauthenticated'; end if;
  perform user_id from public.dp_personal_profiles where user_id=auth.uid() for update;
  delete from public.dp_feedback_events where user_id=auth.uid();
  delete from public.dp_feedback where user_id=auth.uid();
  delete from public.dp_personal_drops where user_id=auth.uid();
  delete from public.dp_personal_plans where user_id=auth.uid();
  delete from public.dp_personal_profiles where user_id=auth.uid();
end $$;
-- The invoker needs delete privileges for the privacy function.
grant delete on public.dp_personal_plans,public.dp_personal_drops to authenticated;
commit;
