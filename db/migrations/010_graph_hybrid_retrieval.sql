-- Apply after 009. Retrieval never grants publication eligibility.
begin;
do $$ begin
  if to_regclass('public.dp_recommendation_history') is null then raise exception 'Apply 009_identity_evidence_history.sql first';end if;
end $$;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
-- Resolve an existing installation in either supported Supabase schema.
set local search_path=public,extensions;

create table public.dp_graph_nodes (
  id text primary key,
  kind text not null check(kind in ('artist','label','recording','release')),
  name text not null,
  source_url text not null check(source_url like 'https://musicbrainz.org/%'),
  observed_at timestamptz not null default now()
);
create index dp_graph_name on public.dp_graph_nodes(kind,lower(name));
create table public.dp_graph_names (
  node_id text not null references public.dp_graph_nodes(id) on delete cascade,
  name text not null,
  source_url text not null check(source_url like 'https://musicbrainz.org/%'),
  primary key(node_id,name)
);
create index dp_graph_alias on public.dp_graph_names(lower(name));
create table public.dp_graph_edges (
  from_id text not null references public.dp_graph_nodes(id) on delete cascade,
  to_id text not null references public.dp_graph_nodes(id) on delete cascade,
  relation text not null check(relation in ('credited_on','issued_as','released_by')),
  source_url text not null check(source_url like 'https://musicbrainz.org/%'),
  observed_at timestamptz not null default now(),
  active boolean not null default true,
  primary key(from_id,to_id,relation)
);
create index dp_graph_reverse on public.dp_graph_edges(to_id) where active;

create table public.dp_retrieval_documents (
  candidate_id text primary key references public.dp_research_candidates(id) on delete cascade,
  recording_id text not null references public.dp_music_recordings(id),
  lexical_text text not null,
  semantic_text text not null,
  content_hash text not null,
  permission_scope text not null check(permission_scope='musicbrainz-core-cc0'),
  source_url text not null check(source_url like 'https://musicbrainz.org/recording/%'),
  search_terms tsvector generated always as (to_tsvector('simple',lexical_text)) stored,
  embedding vector(256),
  embedding_model text check(embedding_model is null or embedding_model='text-embedding-3-small:256'),
  date_from date,
  date_to date,
  refreshed_at timestamptz not null default now(),
  check(embedding is null or embedding_model is not null)
);
create index dp_retrieval_lexical on public.dp_retrieval_documents using gin(search_terms);
create index dp_retrieval_semantic on public.dp_retrieval_documents using hnsw(embedding vector_cosine_ops);
alter table public.dp_research_runs add column retrieval jsonb not null default '{}'::jsonb;

do $$ declare n text;begin
 foreach n in array array['dp_graph_nodes','dp_graph_names','dp_graph_edges','dp_retrieval_documents'] loop
   execute format('alter table public.%I enable row level security',n);
   execute format('revoke all on public.%I from public,anon,authenticated',n);
   execute format('grant select,insert,update,delete on public.%I to service_role',n);
 end loop;
end $$;

-- Bootstrap the existing, source-backed 3D.3A identities.
insert into public.dp_graph_nodes(id,kind,name,source_url)
 select id,'artist',name,source_url from public.dp_music_artists
 union all select id,'recording',title,source_url from public.dp_music_recordings
 union all select distinct on(edition_id) edition_id,'release',title,source_url from public.dp_music_editions;
insert into public.dp_graph_names(node_id,name,source_url)
 select distinct artist_id,credited_name,source_url from public.dp_music_credits on conflict do nothing;
insert into public.dp_graph_edges(from_id,to_id,relation,source_url)
 select distinct artist_id,recording_id,'credited_on',source_url from public.dp_music_credits on conflict do nothing;
insert into public.dp_graph_edges(from_id,to_id,relation,source_url)
 select recording_id,edition_id,'issued_as',source_url from public.dp_music_editions on conflict do nothing;

create function public.dp_research_readiness() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schema','3D.3B','history',to_regclass('public.dp_recommendation_history') is not null,
   'graph',to_regclass('public.dp_graph_edges') is not null,'hybrid',to_regclass('public.dp_retrieval_documents') is not null)
$$;

-- Core names, titles, dates and credits only. Tags, reviews and provider descriptions are excluded.
create function public.dp_refresh_retrieval_index(p_limit integer default 80) returns integer
language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 with pending as (
   select c.id,c.recording_id,r.source_url,
     concat_ws(' ',r.title,(select string_agg(a.name,' ' order by a.id) from public.dp_music_credits cr join public.dp_music_artists a on a.id=cr.artist_id where cr.recording_id=r.id),r.original_date_from::text) as body,
     coalesce((c.facts->'dateInterval'->>'from')::date,c.release_date) as date_from,
     coalesce((c.facts->'dateInterval'->>'to')::date,c.release_date) as date_to
   from public.dp_research_candidates c join public.dp_music_recordings r on r.id=c.recording_id
   left join public.dp_retrieval_documents d on d.candidate_id=c.id
   where c.identity_status='resolved' and not coalesce((c.facts->>'dateConflict')::boolean,false)
     and (d.candidate_id is null or d.refreshed_at<c.last_seen_at)
   order by coalesce(d.refreshed_at,'epoch'::timestamptz),c.id limit least(greatest(p_limit,1),200)
 ), written as (
   insert into public.dp_retrieval_documents(candidate_id,recording_id,lexical_text,semantic_text,content_hash,
     permission_scope,source_url,date_from,date_to)
   select id,recording_id,body,body,md5(body),'musicbrainz-core-cc0',source_url,date_from,date_to from pending
   on conflict(candidate_id) do update set lexical_text=excluded.lexical_text,semantic_text=excluded.semantic_text,
     content_hash=excluded.content_hash,date_from=excluded.date_from,date_to=excluded.date_to,refreshed_at=now(),
     embedding=case when dp_retrieval_documents.content_hash=excluded.content_hash then dp_retrieval_documents.embedding else null end,
     embedding_model=case when dp_retrieval_documents.content_hash=excluded.content_hash then dp_retrieval_documents.embedding_model else null end
   returning 1
 ) select count(*) into changed from written;
 delete from public.dp_retrieval_documents d using public.dp_research_candidates c
   where c.id=d.candidate_id and (c.identity_status<>'resolved' or coalesce((c.facts->>'dateConflict')::boolean,false));
 return changed;
end $$;

create function public.dp_expand_music_graph(p_seeds jsonb) returns table(node_id text,kind text,name text,hops integer,path jsonb)
language sql stable security definer set search_path='' as $$
 with recursive requested as (
   select lower(s->>'name') as name,s->>'kind' as kind from jsonb_array_elements(p_seeds) s limit 20
 ), matches as (
   select distinct q.name,q.kind,n.id from requested q join public.dp_graph_nodes n on n.kind=q.kind
   where lower(n.name)=q.name or exists(select 1 from public.dp_graph_names a where a.node_id=n.id and lower(a.name)=q.name)
 ), seeds as (
   select min(id) as id from matches group by name,kind having count(*)=1
 ), walk(id,visited,hops,path) as (
   select id,array[id],0,'[]'::jsonb from seeds
   union all
   select e.neighbor,w.visited||e.neighbor,w.hops+1,w.path||jsonb_build_array(jsonb_build_object(
     'from',e.from_id,'to',e.to_id,'relation',e.relation,'url',e.source_url))
   from walk w cross join lateral (
     select case when g.from_id=w.id then g.to_id else g.from_id end as neighbor,g.*
     from public.dp_graph_edges g where g.active and (g.from_id=w.id or g.to_id=w.id)
     order by g.observed_at desc,g.from_id,g.to_id limit 8
   ) e where w.hops<3 and not e.neighbor=any(w.visited)
 ), shortest as (select distinct on(id) id,hops,path from walk order by id,hops,path::text)
 select n.id,n.kind,n.name,w.hops,w.path from shortest w join public.dp_graph_nodes n on n.id=w.id
 order by w.hops,n.id limit 40
$$;

create function public.dp_embedding_batch(p_limit integer default 12)
returns table(candidate_id text,semantic_text text,content_hash text,permission_scope text)
language sql stable security definer set search_path='' as $$
 select d.candidate_id,d.semantic_text,d.content_hash,d.permission_scope from public.dp_retrieval_documents d
 join public.dp_research_candidates c on c.id=d.candidate_id and c.identity_status='resolved'
 where d.embedding is null order by d.refreshed_at,d.candidate_id limit least(greatest(p_limit,1),12)
$$;
create function public.dp_save_embedding(p_candidate text,p_hash text,p_embedding vector(256)) returns boolean
language plpgsql security definer set search_path=public,extensions as $$
begin
 if p_embedding is null or vector_dims(p_embedding)<>256 or vector_norm(p_embedding)=0 then raise exception 'Invalid embedding';end if;
 update public.dp_retrieval_documents set embedding=p_embedding,embedding_model='text-embedding-3-small:256'
 where candidate_id=p_candidate and content_hash=p_hash and permission_scope='musicbrainz-core-cc0';
 return found;
end $$;

create function public.dp_hybrid_retrieve(p_query text,p_vector vector(256),p_graph text[],p_from date,p_to date)
returns table(candidate_id text,score double precision,lexical_rank bigint,semantic_rank bigint,graph_rank bigint)
language sql stable security definer set search_path=public,extensions as $$
 with eligible as materialized (
   select d.* from public.dp_retrieval_documents d join public.dp_research_candidates c on c.id=d.candidate_id
   where c.identity_status='resolved' and not coalesce((c.facts->>'dateConflict')::boolean,false)
     and d.date_from>=p_from and d.date_to<=p_to
 ), lexical as (
   select candidate_id,row_number() over(order by ts_rank_cd(search_terms,websearch_to_tsquery('simple',left(p_query,1200))) desc,candidate_id) as rank
   from eligible where search_terms@@websearch_to_tsquery('simple',left(p_query,1200))
   order by rank limit 60
 ), semantic as (
   select candidate_id,row_number() over(order by embedding<=>p_vector,candidate_id) as rank
   from eligible where p_vector is not null and embedding is not null and embedding_model='text-embedding-3-small:256'
   order by rank limit 60
 ), graph as (
   select candidate_id,row_number() over(order by array_position(p_graph,recording_id),candidate_id) as rank
   from eligible where recording_id=any(p_graph) order by rank limit 60
 ), ids as (select candidate_id from lexical union select candidate_id from semantic union select candidate_id from graph)
 select i.candidate_id,(coalesce(1.0/(60+l.rank),0)+coalesce(1.0/(60+s.rank),0)+coalesce(1.0/(60+g.rank),0))::double precision,
   l.rank,s.rank,g.rank
 from ids i left join lexical l using(candidate_id) left join semantic s using(candidate_id) left join graph g using(candidate_id)
 order by 2 desc,i.candidate_id limit 40
$$;

do $$ declare signature text;begin
 foreach signature in array array['dp_research_readiness()','dp_refresh_retrieval_index(integer)',
   'dp_expand_music_graph(jsonb)','dp_embedding_batch(integer)','dp_save_embedding(text,text,vector)',
   'dp_hybrid_retrieve(text,vector,text[],date,date)'] loop
   execute 'revoke all on function public.'||signature||' from public,anon,authenticated';
   execute 'grant execute on function public.'||signature||' to service_role';
 end loop;
end $$;
select public.dp_refresh_retrieval_index(200);
commit;
