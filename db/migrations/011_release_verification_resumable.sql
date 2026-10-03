-- 3D.3C: resumable release verification state.
-- Safe to run once; every object is guarded for repeatable deployment.
alter table if exists public.dp_personal_drops
  add column if not exists next_work_at timestamptz;

update public.dp_personal_drops
set next_work_at = coalesce(next_work_at, scheduled_at, now())
where next_work_at is null;

alter table if exists public.dp_personal_drops
  alter column next_work_at set default now();

create index if not exists dp_personal_drops_research_work_idx
  on public.dp_personal_drops (status, next_work_at);

create table if not exists public.dp_research_preparation (
  drop_id uuid primary key references public.dp_personal_drops(id) on delete cascade,
  state text not null default 'queued'
    check (state in ('queued','running','prepared','published','needs_research','failed')),
  checkpoint jsonb not null default '{}'::jsonb,
  prepared_result jsonb,
  verification jsonb not null default '{}'::jsonb,
  last_error text,
  attempt_count integer not null default 0,
  updated_at timestamptz not null default now(),
  prepared_at timestamptz,
  published_at timestamptz
);

create index if not exists dp_research_preparation_state_idx
  on public.dp_research_preparation (state, updated_at);

alter table public.dp_research_preparation enable row level security;
revoke all on public.dp_research_preparation from public, anon, authenticated;
grant select, insert, update, delete on public.dp_research_preparation to service_role;

create or replace function public.dp_research_readiness()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schema_version','3D.3C',
    'identity_evidence_history', to_regclass('public.dp_music_evidence') is not null,
    'graph_hybrid_retrieval', to_regclass('public.dp_research_documents') is not null,
    'resumable_preparation', to_regclass('public.dp_research_preparation') is not null,
    'next_work_at', exists (
      select 1 from information_schema.columns
      where table_schema='public'
        and table_name='dp_personal_drops'
        and column_name='next_work_at'
    )
  );
$$;
