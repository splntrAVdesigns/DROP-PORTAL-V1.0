-- Run after 007 before deploying 3D. This adds no scheduled network access.
begin;
create table public.dp_research_candidates (
  id text primary key check(id ~ '^research-[a-f0-9]{24}$'),
  identity_key text not null check(length(identity_key) between 3 and 500),
  artist_name text not null,
  title text not null,
  release_date date,
  date_precision text not null check(date_precision in ('day','month','year','unknown')),
  date_basis text not null check(date_basis in ('confirmed-release','upload-only','lead')),
  label text,
  facts jsonb not null default '{}'::jsonb check(jsonb_typeof(facts)='object'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index dp_research_candidates_identity on public.dp_research_candidates(identity_key);
create index dp_research_candidates_date on public.dp_research_candidates(release_date desc) where date_basis='confirmed-release' and date_precision='day';
create unique index dp_research_drop_owner_key on public.dp_personal_drops(id,user_id);
create table public.dp_research_observations (
  candidate_id text not null references public.dp_research_candidates(id) on delete cascade,
  source_id text not null,
  source_url text not null check(length(source_url) between 12 and 1500),
  observed_at timestamptz not null default now(),
  claim_type text not null check(claim_type in ('release','upload','lead')),
  claim_date date,
  claim_precision text not null check(claim_precision in ('day','month','year','unknown')),
  facts jsonb not null default '{}'::jsonb check(jsonb_typeof(facts)='object'),
  primary key(candidate_id,source_id,source_url)
);
create table public.dp_research_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  drop_id uuid not null unique,
  constraint dp_research_run_drop_owner foreign key(drop_id,user_id) references public.dp_personal_drops(id,user_id) on delete cascade,
  status text not null check(status in ('running','complete','partial','access-blocked')),
  window_from date not null,
  window_to date not null,
  request_count integer not null default 0 check(request_count between 0 and 50),
  candidate_count integer not null default 0 check(candidate_count>=0),
  eligible_count integer not null default 0 check(eligible_count>=0),
  fresh_selected integer not null default 0 check(fresh_selected>=0),
  fallback_selected integer not null default 0 check(fallback_selected>=0),
  coverage jsonb not null default '[]'::jsonb check(jsonb_typeof(coverage)='array'),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create table public.dp_research_cursors (
  run_id uuid not null references public.dp_research_runs(id) on delete cascade,
  source_id text not null,
  query_hash text not null check(query_hash ~ '^[a-f0-9]{64}$'),
  cursor_value text check(length(cursor_value)<=1000),
  state text not null check(state in ('complete','truncated','error','access-blocked')),
  pages integer not null check(pages between 0 and 10),
  primary key(run_id,source_id,query_hash)
);
create table public.dp_research_run_candidates (
  run_id uuid not null references public.dp_research_runs(id) on delete cascade,
  candidate_id text not null references public.dp_research_candidates(id) on delete cascade,
  eligible boolean not null,
  primary key(run_id,candidate_id)
);
create table public.dp_research_source_health (
  source_id text primary key,
  status text not null check(status in ('disabled','ready','access-blocked')),
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_state text,
  last_count integer not null default 0 check(last_count>=0)
);
insert into public.dp_research_source_health(source_id,status) values
  ('musicbrainz-live','access-blocked'),('soundcloud-live','access-blocked'),
  ('mixcloud-leads','access-blocked'),('bandcamp-indexed','access-blocked'),
  ('beatport','disabled'),('discogs','disabled');
alter table public.dp_personal_drops add column research_run_id uuid references public.dp_research_runs(id) on delete set null;

-- Research facts are shared, but private run state and query cursors are account-linked.
-- Only the worker writes catalog data or receives query cursors.
alter table public.dp_research_candidates enable row level security;
revoke all on public.dp_research_candidates from public,anon,authenticated;
grant select,insert,update,delete on public.dp_research_candidates to service_role;
alter table public.dp_research_observations enable row level security;
revoke all on public.dp_research_observations from public,anon,authenticated;
grant select,insert,update,delete on public.dp_research_observations to service_role;
alter table public.dp_research_runs enable row level security;
revoke all on public.dp_research_runs from public,anon,authenticated;
grant select,insert,update,delete on public.dp_research_runs to service_role;
alter table public.dp_research_cursors enable row level security;
revoke all on public.dp_research_cursors from public,anon,authenticated;
grant select,insert,update,delete on public.dp_research_cursors to service_role;
alter table public.dp_research_run_candidates enable row level security;
revoke all on public.dp_research_run_candidates from public,anon,authenticated;
grant select,insert,update,delete on public.dp_research_run_candidates to service_role;
alter table public.dp_research_source_health enable row level security;
revoke all on public.dp_research_source_health from public,anon,authenticated;
grant select,insert,update,delete on public.dp_research_source_health to service_role;
grant select on public.dp_research_runs to authenticated;
create policy dp_research_run_owner on public.dp_research_runs for select to authenticated using ((select auth.uid())=user_id);
commit;
