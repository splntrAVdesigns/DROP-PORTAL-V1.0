import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {sqlClient} from './helpers/research-client.mjs';
import {retrievalReadiness,persistMusicGraph,expandMusicGraph,retrieveMusic,embedRetrievalTexts,warmRetrievalIndex} from '../lib/hybrid-retrieval.js';
import {researchPersonalJob,eligibleResearchCandidate} from '../lib/personal-research-runtime.js';
import {normalizePersonalRecording,runSourceAdapter,createRequestBudget} from '../lib/personal-research-adapters.js';
import {PERSONAL_DEFAULTS} from '../lib/personal-contracts.js';
const uuid=n=>String(n).padStart(8,'0')+'-1111-4111-8111-111111111111';
const vec=n=>Array.from({length:256},(_,i)=>i===n?1:0);
const window={from:'2026-09-01',to:'2026-10-02'};
const row={id:uuid(1),title:'Hidden Passage','first-release-date':'2026-09-20',
  'artist-credit':[{name:'Secret Alias',artist:{id:uuid(2),name:'Hidden Artist'}}],releases:[{id:uuid(3),title:'Deep EP',date:'2026-09-20'}]};
const source={id:'musicbrainz',kind:'musicbrainz-recordings',enabled:true,maxItems:10,maxRequests:3};
const response=data=>({ok:true,text:async()=>JSON.stringify(data)});

test('embedding contract rejects unlicensed text, bad dimensions, duplicate indices and rate limits',async()=>{
 const items=[{text:'Hidden Artist',permissionScope:'musicbrainz-core-cc0'}];
 const result=await embedRetrievalTexts(items,{key:'test',fetcher:async(url,opts)=>{
   assert.equal(url,'https://api.openai.com/v1/embeddings');assert.equal(opts.redirect,'error');
   assert.equal(JSON.parse(opts.body).dimensions,256);
   return response({model:'text-embedding-3-small',data:[{index:0,embedding:vec(0)}],usage:{total_tokens:3}});
 }});assert.equal(result.tokens,3);
 await assert.rejects(embedRetrievalTexts([{text:'review',permissionScope:'unlicensed'}],{key:'test'}),/approved/);
 await assert.rejects(embedRetrievalTexts(items,{key:'test',fetcher:async()=>response({model:'text-embedding-3-small',data:[{index:0,embedding:[1]}]})}),/vector/);
 await assert.rejects(embedRetrievalTexts([...items,...items],{key:'test',fetcher:async()=>response({model:'text-embedding-3-small',data:[{index:0,embedding:vec(0)},{index:0,embedding:vec(1)}]})}),/vector/);
 await assert.rejects(embedRetrievalTexts(items,{key:'test',fetcher:async()=>({ok:false,status:429})}),/rate limited/);
});

test('bounded release lookup obtains label IDs from matching release response',async()=>{
 const plan={window,queries:[{kind:'artist',term:'Hidden Artist'}],maxRequests:10};let calls=0;
 const budget=createRequestBudget({fetcher:async url=>{calls++;return response(String(url).includes('/release/')?
   {id:uuid(3),'label-info':[{label:{id:uuid(4),name:'Small Label'}}]}:{recordings:[row],count:1});}});
 const found=await runSourceAdapter(source,{plan,budget,throttleMs:0,expandRelationships:true});
 assert.equal(calls,2);assert.equal(found.candidates[0].identity.editions[0].labels[0].id,'mblabel:'+uuid(4));
});

test('real PostgreSQL graph, hybrid vectors, eligibility, permissions and worker integration',async()=>{
 const db=new PGlite({extensions:{vector}}),client=sqlClient(db);
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create table auth.users(id uuid primary key);insert into auth.users values('${uuid(9)}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  for(const name of ['001_personal_discovery','003_personal_drops','004_one_time_replacement','005_personal_drop_reliability','007_weekly_drop_sequence','008_research_foundation','009_identity_evidence_history'])
    await db.exec(await readFile(new URL('../db/migrations/'+name+'.sql',import.meta.url),'utf8'));
  await assert.rejects(retrievalReadiness(client),/009 then 010/);
  await db.exec(await readFile(new URL('../db/migrations/010_graph_hybrid_retrieval.sql',import.meta.url),'utf8'));
  assert.equal((await retrievalReadiness(client)).history,true);
  const job=(await db.query("insert into dp_personal_drops(user_id,kind,status,scheduled_at,profile_snapshot) values($1,'weekly','queued','2026-10-02',$2) returning *",[uuid(9),JSON.stringify({...PERSONAL_DEFAULTS,artists:['Hidden Artist']})])).rows[0];
  const run=await researchPersonalJob(client,job,{now:new Date('2026-10-02T12:00:00Z'),sources:[source],throttleMs:0,hybridEnabled:true,
    embeddingOptions:{semanticEnabled:false},fetcher:async url=>response(String(url).includes('/release/')?
      {id:uuid(3),'label-info':[{label:{id:uuid(4),name:'Small Label'}}]}:{recordings:[row],count:1})});
  assert.equal(run.tracks.length,0,'Metadata retrieval never bypasses release-page verification');
  const graph=await expandMusicGraph(client,{labels:['Small Label']});
  assert.ok(graph.some(n=>n.kind==='artist'&&n.hops===3));assert.ok(graph.every(n=>n.hops<=3));
  assert.ok(graph.find(n=>n.kind==='recording').path.every(p=>p.url.startsWith('https://musicbrainz.org/')));
  const aliases=await expandMusicGraph(client,{artists:['Secret Alias']});assert.ok(aliases.some(n=>n.kind==='recording'));
  await db.query("insert into dp_graph_nodes values($1,'artist','Hidden Artist',$2,now())",['mbartist:'+uuid(8),'https://musicbrainz.org/artist/'+uuid(8)]);
  assert.deepEqual(await expandMusicGraph(client,{artists:['Hidden Artist']}),[],'Ambiguous names never arbitrarily resolve');
  const docs=(await db.query('select * from dp_retrieval_documents')).rows;assert.equal(docs.length,1);
  const doc=docs[0];
  const retrieve=async(q,v,g=[],from=window.from,to=window.to)=>(await db.query('select * from dp_hybrid_retrieve($1,$2,$3,$4,$5)',[q,v?JSON.stringify(v):null,g,from,to])).rows;
  assert.equal((await retrieve('Hidden',null)).length,1);
  assert.equal((await retrieve('no_matching_keyword',null)).length,0);
  assert.equal((await db.query('select dp_save_embedding($1,$2,$3) as saved',[doc.candidate_id,'wrong-hash',JSON.stringify(vec(0))])).rows[0].saved,false);
  await db.query('select dp_save_embedding($1,$2,$3)',[doc.candidate_id,doc.content_hash,JSON.stringify(vec(0))]);
  assert.equal((await retrieve('no_matching_keyword',vec(0)))[0].semantic_rank,1);
  assert.equal((await retrieve('no_matching_keyword',null,[doc.recording_id]))[0].graph_rank,1);
  assert.equal((await retrieve('Hidden',vec(0),[], '2026-09-21')).length,0);
  const hydrated=await retrieveMusic(client,{window,queries:[{term:'Hidden Artist'}]},graph,{semanticEnabled:false});
  assert.equal(hydrated.candidates.length,1);assert.equal(eligibleResearchCandidate(hydrated.candidates[0],window),false);
  assert.equal((await warmRetrievalIndex(client,{semanticEnabled:true,key:''})).report.semanticState,'credentials-missing');
  await db.query('update dp_retrieval_documents set embedding=null,embedding_model=null where candidate_id=$1',[doc.candidate_id]);
  const semantic=await retrieveMusic(client,{window,queries:[{term:'no_matching_keyword'}]},[],{semanticEnabled:true,key:'fixture',fetcher:async(url,opts)=>{
    const input=JSON.parse(opts.body).input;
    return response({model:'text-embedding-3-small',data:input.map((_,index)=>({index,embedding:vec(0)})),usage:{total_tokens:7}});
  }});
  assert.equal(semantic.report.indexed,1);assert.equal(semantic.report.semanticHits,1);assert.equal(semantic.report.tokens,7);
  await db.query("update dp_retrieval_documents set date_from='2026-01-01',date_to='2026-12-31' where candidate_id=$1",[doc.candidate_id]);
  assert.equal((await retrieve('Hidden',vec(0))).length,0,'Year precision cannot silently fit a month window');
  await db.query("update dp_retrieval_documents set date_from='2026-09-20',date_to='2026-09-20' where candidate_id=$1",[doc.candidate_id]);
  await db.query("update dp_music_recordings set title='Changed title' where id=$1",[doc.recording_id]);
  await db.query("update dp_research_candidates set last_seen_at=now()+interval '1 minute' where id=$1",[doc.candidate_id]);
  await warmRetrievalIndex(client,{semanticEnabled:false});
  const changed=(await db.query('select * from dp_retrieval_documents')).rows[0];
  assert.notEqual(changed.content_hash,doc.content_hash);assert.equal(changed.embedding,null);
  const limited=await warmRetrievalIndex(client,{semanticEnabled:true,key:'fixture',fetcher:async()=>({ok:false,status:429})});
  assert.equal(limited.report.semanticState,'rate-limited');
  const denied=(await db.query("select has_function_privilege('authenticated','dp_hybrid_retrieve(text,extensions.vector,text[],date,date)','execute') as allowed")).rows[0];assert.equal(denied.allowed,false);
  await db.exec("set role authenticated");await assert.rejects(db.query('select * from dp_graph_edges'),/permission denied/);await db.exec('reset role');
  await db.query("update dp_research_candidates set identity_status='conflict' where id=$1",[doc.candidate_id]);
  assert.equal((await retrieve('Hidden',vec(0))).length,0);
  await warmRetrievalIndex(client,{semanticEnabled:false});assert.equal((await db.query('select * from dp_retrieval_documents')).rows.length,0);
 }finally{await db.close();}
});
