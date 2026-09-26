-- Run in a Supabase project SQL editor. No personal data belongs in GitHub.
begin;
create table public.dp_personal_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  base_profile jsonb not null check (jsonb_typeof(base_profile)='object'),
  weekly_profile jsonb check (weekly_profile is null or jsonb_typeof(weekly_profile)='object'),
  target_date date,
  learning_enabled boolean not null default false,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table public.dp_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null check (length(track_id) between 1 and 128),
  kind text not null check (kind in ('saved','heard','hidden')),
  value boolean not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key(user_id,track_id,kind)
);
create table public.dp_feedback_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null,
  kind text not null check (kind in ('saved','heard','hidden')),
  value boolean not null,
  meaning text not null check (meaning in ('positive','withdrawn','neutral')),
  occurred_at timestamptz not null default now()
);
create index dp_feedback_events_owner_time on public.dp_feedback_events(user_id,occurred_at);
alter table public.dp_personal_profiles enable row level security;
alter table public.dp_feedback enable row level security;
alter table public.dp_feedback_events enable row level security;
create policy personal_owner on public.dp_personal_profiles for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy feedback_owner on public.dp_feedback for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy events_owner on public.dp_feedback_events for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.dp_personal_profiles,public.dp_feedback,public.dp_feedback_events from anon;
grant select,insert,update,delete on public.dp_personal_profiles,public.dp_feedback,public.dp_feedback_events to authenticated;
grant usage,select on sequence public.dp_feedback_events_id_seq to authenticated;

create function public.dp_save_profile(p_base jsonb,p_weekly jsonb,p_target date,p_learning boolean,p_expected bigint)
returns setof public.dp_personal_profiles language plpgsql security invoker set search_path='' as $$
declare current_revision bigint;
begin
  if auth.uid() is null then raise exception 'Unauthenticated'; end if;
  insert into public.dp_personal_profiles(user_id,base_profile) values(auth.uid(),p_base) on conflict do nothing;
  select revision into current_revision from public.dp_personal_profiles where user_id=auth.uid() for update;
  if current_revision<>p_expected then raise exception 'revision_conflict' using errcode='40001'; end if;
  update public.dp_personal_profiles set base_profile=p_base,weekly_profile=p_weekly,target_date=p_target,
    learning_enabled=p_learning,revision=revision+1,updated_at=now() where user_id=auth.uid();
  if not p_learning then delete from public.dp_feedback_events where user_id=auth.uid(); end if;
  return query select * from public.dp_personal_profiles where user_id=auth.uid();
end $$;

create function public.dp_set_feedback(p_track text,p_kind text,p_value boolean,p_expected bigint,p_import boolean default false)
returns setof public.dp_feedback language plpgsql security invoker set search_path='' as $$
declare current_revision bigint; learning boolean;
begin
  if auth.uid() is null then raise exception 'Unauthenticated'; end if;
  -- Serialize mutations and profile opt-out for each user.
  perform user_id from public.dp_personal_profiles where user_id=auth.uid() for update;
  if not found then raise exception 'Save a profile before syncing your crate.'; end if;
  select revision into current_revision from public.dp_feedback where user_id=auth.uid() and track_id=p_track and kind=p_kind;
  if p_import and current_revision is not null then
    return query select * from public.dp_feedback where user_id=auth.uid() and track_id=p_track and kind=p_kind; return;
  end if;
  if coalesce(current_revision,0)<>p_expected then raise exception 'revision_conflict' using errcode='40001'; end if;
  insert into public.dp_feedback(user_id,track_id,kind,value) values(auth.uid(),p_track,p_kind,p_value)
    on conflict(user_id,track_id,kind) do update set value=excluded.value,revision=dp_feedback.revision+1,updated_at=now();
  select learning_enabled into learning from public.dp_personal_profiles where user_id=auth.uid();
  if learning and not p_import then
    insert into public.dp_feedback_events(user_id,track_id,kind,value,meaning)
      values(auth.uid(),p_track,p_kind,p_value,case when p_kind='saved' then case when p_value then 'positive' else 'withdrawn' end else 'neutral' end);
  end if;
  delete from public.dp_feedback_events where user_id=auth.uid() and occurred_at<now()-interval '180 days';
  return query select * from public.dp_feedback where user_id=auth.uid() and track_id=p_track and kind=p_kind;
end $$;

create function public.dp_clear_personal_data() returns void language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Unauthenticated'; end if;
  perform user_id from public.dp_personal_profiles where user_id=auth.uid() for update;
  delete from public.dp_feedback_events where user_id=auth.uid();
  delete from public.dp_feedback where user_id=auth.uid();
  delete from public.dp_personal_profiles where user_id=auth.uid();
end $$;
revoke all on function public.dp_save_profile(jsonb,jsonb,date,boolean,bigint),public.dp_set_feedback(text,text,boolean,bigint,boolean),public.dp_clear_personal_data() from public,anon;
grant execute on function public.dp_save_profile(jsonb,jsonb,date,boolean,bigint),public.dp_set_feedback(text,text,boolean,bigint,boolean),public.dp_clear_personal_data() to authenticated;
commit;
