-- Apply once, after 008 and before deploying 3D.3A.
begin;
lock table public.dp_personal_drops in share row exclusive mode;

create table public.dp_music_artists (
  id text primary key,
  name text not null,
  source_url text not null check(source_url like 'https://musicbrainz.org/artist/%')
);
create table public.dp_music_recordings (
  id text primary key,
  title text not null,
  source_url text not null check(source_url like 'https://musicbrainz.org/recording/%'),
  original_date_from date,
  original_date_to date,
  date_precision text not null check(date_precision in ('day','month','year','unknown')),
  check((original_date_from is null)=(original_date_to is null)),
  check(original_date_from<=original_date_to)
);
create table public.dp_music_credits (
  recording_id text not null references public.dp_music_recordings(id),
  artist_id text not null references public.dp_music_artists(id),
  credited_name text not null,
  source_url text not null,
  primary key(recording_id,artist_id,credited_name)
);
create table public.dp_music_editions (
  recording_id text not null references public.dp_music_recordings(id),
  edition_id text not null,
  title text not null,
  source_url text not null,
  date_from date,
  date_to date,
  date_precision text not null check(date_precision in ('day','month','year','unknown')),
  primary key(recording_id,edition_id),
  check((date_from is null)=(date_to is null)),
  check(date_from<=date_to)
);
alter table public.dp_research_candidates add column recording_id text references public.dp_music_recordings(id);
alter table public.dp_research_candidates add column identity_status text not null default 'unresolved'
  check(identity_status in ('resolved','unresolved','conflict'));

-- Append-only claim events supplement the prior latest-observation cache.
-- No account IDs, personal queries, or raw provider responses are retained here.
create table public.dp_music_evidence (
  id text primary key check(id ~ '^[a-f0-9]{64}$'),
  candidate_id text not null references public.dp_research_candidates(id),
  recording_id text references public.dp_music_recordings(id),
  source_id text not null,
  source_url text not null check(source_url like 'https://%'),
  claim_type text not null check(claim_type in ('release','upload','lead','release-page')),
  claim_from date,
  claim_to date,
  claim_precision text not null check(claim_precision in ('day','month','year','unknown')),
  observed_at timestamptz not null,
  permission_scope text not null default 'metadata-only' check(permission_scope='metadata-only'),
  embedding_allowed boolean not null default false check(not embedding_allowed),
  verification text not null check(verification in ('source-claim','verified','unverified')),
  check((claim_from is null)=(claim_to is null)),
  check(claim_from<=claim_to)
);
create index dp_music_evidence_candidate on public.dp_music_evidence(candidate_id,observed_at desc);

do $$ declare name text; begin
  foreach name in array array['dp_music_artists','dp_music_recordings','dp_music_credits','dp_music_editions','dp_music_evidence'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated',name);
    execute format('grant select,insert,update on public.%I to service_role',name);
  end loop;
end $$;
revoke update on public.dp_music_evidence from service_role;

-- Multiple keys protect legacy IDs and conservative title families as well as resolved recordings.
-- The title-family guard can over-suppress ambiguous homonyms; it never proves identity.
create function public.dp_recommendation_keys(p_track jsonb) returns text[]
language plpgsql immutable set search_path='' as $$
declare keys text[]:='{}'; artist text; title text; previous_title text; recording text;
begin
  if coalesce(p_track->>'id','')='' or coalesce(p_track->>'artistName','')='' or coalesce(p_track->>'title','')='' then
    raise exception 'Recommendation identity missing';
  end if;
  keys:=array_append(keys,'track:'||(p_track->>'id'));
  artist:=lower(regexp_replace(normalize(btrim(p_track->>'artistName'),NFKC),'\s+',' ','g'));
  title:=lower(regexp_replace(normalize(btrim(p_track->>'title'),NFKC),'\s+',' ','g'));
  -- Suppress related remix/VIP/reissue titles by default, preserving their separate recording IDs.
  loop
    previous_title:=title;
    title:=regexp_replace(title,'\s*\([^)]*(remix|remaster|reissue|vip|edit|mix)[^)]*\)\s*$','','i');
    title:=regexp_replace(title,'\s*\[[^]]*(remix|remaster|reissue|vip|edit|mix)[^]]*\]\s*$','','i');
    title:=regexp_replace(title,'\s+-\s+.*(remix|remaster|reissue|vip|edit|mix).*$','','i');
    exit when title=previous_title;
  end loop;
  keys:=array_append(keys,'name:'||artist||'|'||btrim(title));
  recording:=p_track->>'canonicalRecordingId';
  if recording ~ '^mbrecording:[a-f0-9-]{36}$' then keys:=array_append(keys,'recording:'||recording);end if;
  return keys;
end $$;
revoke all on function public.dp_recommendation_keys(jsonb) from public,anon,authenticated;
grant execute on function public.dp_recommendation_keys(jsonb) to service_role;

create table public.dp_recommendation_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_key text not null,
  drop_id uuid references public.dp_personal_drops(id) on delete set null,
  track_id text not null,
  recommended_at timestamptz not null default now(),
  primary key(user_id,identity_key)
);
alter table public.dp_recommendation_history enable row level security;
revoke all on public.dp_recommendation_history from public,anon,authenticated;
grant select,delete on public.dp_recommendation_history to authenticated;
grant select,insert,update,delete on public.dp_recommendation_history to service_role;
create policy recommendation_owner_read on public.dp_recommendation_history for select to authenticated using ((select auth.uid())=user_id);
create policy recommendation_owner_delete on public.dp_recommendation_history for delete to authenticated using ((select auth.uid())=user_id);

-- Backfill earlier completed private drops without renumbering or altering their results.
insert into public.dp_recommendation_history(user_id,identity_key,drop_id,track_id,recommended_at)
select distinct on (d.user_id,k) d.user_id,k,d.id,t->>'id',d.updated_at
from public.dp_personal_drops d cross join lateral jsonb_array_elements(coalesce(d.result->'tracks','[]')) t
cross join lateral unnest(public.dp_recommendation_keys(t)) k
where d.status='ready' and coalesce(t->>'id','')<>'' and coalesce(t->>'artistName','')<>'' and coalesce(t->>'title','')<>''
order by d.user_id,k,d.scheduled_at,d.created_at,d.id;

create function public.dp_filter_recommendations(p_user uuid,p_tracks jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(t||jsonb_build_object('recommendationKeys',public.dp_recommendation_keys(t)) order by ordinal),'[]'::jsonb)
  from jsonb_array_elements(p_tracks) with ordinality as items(t,ordinal)
  where not exists(select 1 from public.dp_recommendation_history h where h.user_id=p_user
    and h.identity_key=any(public.dp_recommendation_keys(t)))
$$;
revoke all on function public.dp_filter_recommendations(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.dp_filter_recommendations(uuid,jsonb) to service_role;

create function public.dp_record_recommendations() returns trigger
language plpgsql security definer set search_path='' as $$
declare t jsonb; k text; keys text[]; seen text[]:='{}'; prior uuid;
begin
  if TG_OP='UPDATE' and old.status='ready' then
    if new.result is distinct from old.result or new.user_id<>old.user_id or new.status<>'ready' then
      raise exception 'Published drop is immutable';
    end if;
    return new;
  end if;
  if new.status<>'ready' then return new;end if;
  if jsonb_typeof(new.result->'tracks') is distinct from 'array' or jsonb_array_length(new.result->'tracks')=0 then
    raise exception 'Ready drop needs tracks';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
  for t in select value from jsonb_array_elements(new.result->'tracks') loop
    keys:=public.dp_recommendation_keys(t);
    if seen&&keys then raise exception 'duplicate_recommendation' using errcode='23505';end if;
    seen:=seen||keys;
    foreach k in array keys loop
      if exists(select 1 from public.dp_recommendation_history where user_id=new.user_id and identity_key=k) then
        raise exception 'duplicate_recommendation' using errcode='23505';
      end if;
      insert into public.dp_recommendation_history(user_id,identity_key,drop_id,track_id)
        values(new.user_id,k,new.id,t->>'id');
    end loop;
  end loop;
  return new;
end $$;
revoke all on function public.dp_record_recommendations() from public,anon,authenticated;
create trigger dp_record_recommendations after insert or update on public.dp_personal_drops
for each row execute function public.dp_record_recommendations();

-- History survives removal of an individual drop, but explicit clear-all resets it.
create or replace function public.dp_clear_personal_data() returns void language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Unauthenticated';end if;
  perform user_id from public.dp_personal_profiles where user_id=auth.uid() for update;
  delete from public.dp_feedback_events where user_id=auth.uid();
  delete from public.dp_feedback where user_id=auth.uid();
  delete from public.dp_personal_drops where user_id=auth.uid();
  delete from public.dp_recommendation_history where user_id=auth.uid();
  delete from public.dp_weekly_counters where user_id=auth.uid();
  delete from public.dp_personal_plans where user_id=auth.uid();
  delete from public.dp_personal_profiles where user_id=auth.uid();
end $$;
commit;
