-- Read-only. Safe even when 009 or 010 is absent. Run in Supabase SQL Editor.
select
  to_regclass('public.dp_research_candidates') is not null as migration_008_present,
  to_regclass('public.dp_recommendation_history') is not null as migration_009_present,
  to_regclass('public.dp_graph_edges') is not null
    and to_regclass('public.dp_retrieval_documents') is not null
    and to_regprocedure('public.dp_research_readiness()') is not null as migration_010_present;
-- All three must be true before deploying 3D.3B. Apply missing migrations in order.
