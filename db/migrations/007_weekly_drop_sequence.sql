-- Run after 005; 006 is optional and independent of numbering.
begin;
lock table public.dp_personal_drops in access exclusive mode;
alter table public.dp_personal_drops add column weekly_sequence integer;
create table public.dp_weekly_counters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_number integer not null check(last_number>0)
);
alter table public.dp_weekly_counters enable row level security;
revoke all on public.dp_weekly_counters from public,anon,authenticated;
grant select,delete on public.dp_weekly_counters to authenticated;
grant select,insert,update,delete on public.dp_weekly_counters to service_role;
create policy weekly_counter_owner_read on public.dp_weekly_counters for select to authenticated using ((select auth.uid())=user_id);
create policy weekly_counter_owner_delete on public.dp_weekly_counters for delete to authenticated using ((select auth.uid())=user_id);

-- The row counter serializes simultaneous completions and rolls back with them.
create function public.dp_assign_weekly_sequence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='UPDATE' and old.weekly_sequence is not null then
    new.weekly_sequence:=old.weekly_sequence;
  else
    new.weekly_sequence:=null;
    if new.kind='weekly' and new.status='ready' then
      insert into public.dp_weekly_counters(user_id,last_number) values(new.user_id,1)
      on conflict(user_id) do update set last_number=public.dp_weekly_counters.last_number+1
      returning last_number into new.weekly_sequence;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.dp_assign_weekly_sequence() from public,anon,authenticated;
create trigger dp_weekly_sequence before insert or update on public.dp_personal_drops
for each row execute function public.dp_assign_weekly_sequence();

-- Existing successful weekly drops are numbered by schedule, then creation/id.
do $$ declare item record; begin
  for item in select id from public.dp_personal_drops where kind='weekly' and status='ready'
    order by user_id,scheduled_at,created_at,id loop
    update public.dp_personal_drops set weekly_sequence=null where id=item.id;
  end loop;
end $$;
alter table public.dp_personal_drops add constraint dp_weekly_sequence_valid
  check(weekly_sequence is null or (kind='weekly' and weekly_sequence>0));
create unique index dp_weekly_sequence_owner on public.dp_personal_drops(user_id,weekly_sequence) where weekly_sequence is not null;

-- Explicitly clearing all private data also resets this account's catalog.
create or replace function public.dp_clear_personal_data() returns void language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Unauthenticated'; end if;
  perform user_id from public.dp_personal_profiles where user_id=auth.uid() for update;
  delete from public.dp_feedback_events where user_id=auth.uid();
  delete from public.dp_feedback where user_id=auth.uid();
  delete from public.dp_personal_drops where user_id=auth.uid();
  delete from public.dp_weekly_counters where user_id=auth.uid();
  delete from public.dp_personal_plans where user_id=auth.uid();
  delete from public.dp_personal_profiles where user_id=auth.uid();
end $$;
commit;
