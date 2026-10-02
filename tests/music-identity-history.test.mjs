import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {releaseInterval,intervalInWindow,musicBrainzIdentity,candidateIdentity} from '../lib/music-identity.js';
import {mergePersonalCandidates,eligibleResearchCandidate,researchPersonalJob} from '../lib/personal-research-runtime.js';
import {PERSONAL_DEFAULTS} from '../lib/personal-contracts.js';

// Exercise the runtime's actual SQL writes through a small PostgREST-shaped test client.
function sqlClient(db){return {from(table){
  const conditions=[],params=[];let mode='select',columns='*',values,options={},single=false;
  const ident=s=>{assert.match(s,/^[a-z_][a-z_0-9]*$/);return '"'+s+'"';};
  const q={select(c){columns=c;return q;},maybeSingle(){single=true;return q;},
    eq(k,v){conditions.push(ident(k)+'=$'+(params.push(v)));return q;},
    in(k,v){conditions.push(ident(k)+'=any($'+(params.push(v))+'::text[])');return q;},
    upsert(v,o={}){mode='upsert';values=Array.isArray(v)?v:[v];options=o;return q;},
    update(v){mode='update';values=v;return q;},async then(resolve,reject){try{
      let result;
      if(mode==='upsert'){
        for(const row of values){
          const keys=Object.keys(row),args=keys.map(k=>row[k]&&typeof row[k]==='object'?JSON.stringify(row[k]):row[k]);
          const conflict=options.onConflict.split(',').map(ident).join(',');
          const action=options.ignoreDuplicates?'nothing':'update set '+keys.map(k=>ident(k)+'=excluded.'+ident(k)).join(',');
          await db.query('insert into '+ident(table)+'('+keys.map(ident).join(',')+') values('+keys.map((_,i)=>'$'+(i+1)).join(',')+') on conflict('+conflict+') do '+action,args);
        }result={rows:[]};
      }else if(mode==='update'){
        const assignments=Object.entries(values).map(([k,v])=>ident(k)+'=$'+params.push(v&&typeof v==='object'?JSON.stringify(v):v));
        result=await db.query('update '+ident(table)+' set '+assignments.join(',')+' where '+conditions.join(' and '),params);
      }else result=await db.query('select '+(columns==='*'?'*':columns.split(',').map(ident).join(','))+' from '+ident(table)+(conditions.length?' where '+conditions.join(' and '):''),params);
      resolve({data:single?result.rows[0]||null:result.rows,error:null});
    }catch(error){reject(error);}}};return q;
}};}

test('historical date precision and source-scoped identity cannot silently become exact matches',()=>{
  assert.deepEqual(releaseInterval('1996'),{from:'1996-01-01',to:'1996-12-31',precision:'year'});
  assert.deepEqual(releaseInterval('2000-02'),{from:'2000-02-01',to:'2000-02-29',precision:'month'});
  assert.equal(releaseInterval('2026-02-29'),null);
  assert.equal(intervalInWindow(releaseInterval('1996'),{from:'1996-05-01',to:'1996-12-31'}),false);
  const id='11111111-1111-4111-8111-111111111111',url='https://musicbrainz.org/recording/'+id;
  const identity=musicBrainzIdentity({id,'artist-credit':[{name:'Alias',artist:{id,name:'Canonical'}}],releases:[{id,title:'Reissue',date:'2026-09'}]});
  assert.equal(identity.artists[0].creditedName,'Alias');assert.equal(identity.editions[0].date.precision,'month');
  const record={id:'research-'+'a'.repeat(24),artistName:'A',title:'T',identityKey:'a|t',identity,
    evidence:[{sourceId:'mb',url,claimType:'release',recordingId:identity.recordingId,claimDate:'2026-09-20'}],
    destinations:[],releaseDate:'2026-09-20',datePrecision:'day',dateBasis:'confirmed-release'};
  const lead={...record,id:'research-'+'b'.repeat(24),identity:undefined,evidence:[{sourceId:'sc',url:'https://soundcloud.com/a/t'}],destinations:[{kind:'listen',url:'https://soundcloud.com/a/t'}]};
  assert.equal(mergePersonalCandidates([record,lead]).length,2);
  assert.equal(candidateIdentity(lead).status,'unresolved');
  assert.equal(eligibleResearchCandidate(record,{from:'2026-09-01',to:'2026-10-01'}),false);
  const resolved={...record,destinations:lead.destinations,evidence:[...record.evidence,{sourceId:'release-verifier',url:'https://soundcloud.com/a/t',
    claimType:'release-page',recordingId:identity.recordingId,verification:'verified',checkedAt:'2026-10-02T12:00:00Z'}]};
  assert.equal(eligibleResearchCandidate(resolved,{from:'2026-09-01',to:'2026-10-01'}),true);
  assert.equal(eligibleResearchCandidate({...resolved,identity:{...identity,providerId:'invalid'}},{from:'2026-09-01',to:'2026-10-01'}),false);
  const conflict=mergePersonalCandidates([record,{...record,releaseDate:'2026-09-21'}])[0];assert.equal(conflict.dateConflict,true);
});

test('history backfills, isolates accounts, survives drop deletion, and publishes atomically',async()=>{
  const db=new PGlite();const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;`);
    for(const name of ['001_personal_discovery','003_personal_drops','004_one_time_replacement','005_personal_drop_reliability','007_weekly_drop_sequence','008_research_foundation'])
      await db.exec(await readFile(new URL('../db/migrations/'+name+'.sql',import.meta.url),'utf8'));
    const t={id:'old-track',artistName:'Hidden Artist',title:'Deep Passage'};
    const create=async(user,day,kind='weekly',status='queued',tracks=null)=>(await db.query(
      'insert into dp_personal_drops(user_id,kind,status,scheduled_at,profile_snapshot,result) values($1,$2,$3,$4,\'{}\',$5) returning id',
      [user,kind,status,day,tracks?JSON.stringify({tracks}):null])).rows[0].id;
    const legacy=await create(a,'2026-09-25','weekly','ready',[t]);
    await db.exec(await readFile(new URL('../db/migrations/009_identity_evidence_history.sql',import.meta.url),'utf8'));
    assert.equal((await db.query('select * from dp_recommendation_history')).rows.length,2);
    const filter=async(user,tracks)=>(await db.query('select dp_filter_recommendations($1,$2) as tracks',[user,JSON.stringify(tracks)])).rows[0].tracks;
    assert.equal((await filter(a,[{...t,id:'other-store'}])).length,0);
    assert.equal((await filter(b,[t])).length,1);
    assert.equal((await filter(a,[{...t,id:'remaster',title:'Deep Passage (2026 Remaster)'}])).length,0);
    assert.equal((await filter(a,[{...t,id:'vip',title:'Deep Passage - VIP Mix'}])).length,0);
    assert.equal((await filter(a,[{...t,id:'other-artist',artistName:'Another Artist'}])).length,1);
    const first=await create(a,'2026-10-02'),second=await create(a,'2026-10-03','one_time');
    const novel={id:'new-track',artistName:'New Artist',title:'Untouched'};
    const publish=(id,tracks)=>db.query("update dp_personal_drops set status='ready',result=$2 where id=$1",[id,JSON.stringify({tracks})]);
    // Two selections made against the same old history: only the first can commit.
    const pool1=await filter(a,[novel]),pool2=await filter(a,[novel]);
    await publish(first,pool1);await assert.rejects(publish(second,pool2),/duplicate_recommendation/);
    assert.equal((await db.query('select status from dp_personal_drops where id=$1',[second])).rows[0].status,'queued');
    const before=(await db.query('select count(*)::int as n from dp_recommendation_history')).rows[0].n;
    await assert.rejects(publish(second,[{id:'unique',artistName:'Z',title:'Safe'},t]),/duplicate_recommendation/);
    assert.equal((await db.query('select count(*)::int as n from dp_recommendation_history')).rows[0].n,before);
    await assert.rejects(publish(first,[t]),/immutable/);
    await db.query('delete from dp_personal_drops where id=$1',[legacy]);assert.equal((await filter(a,[t])).length,0);
    const shared=await create(b,'2026-10-02');await publish(shared,[t]);
    const mbid='33333333-3333-4333-8333-333333333333';let releaseDate='2026-09-20';
    const client=sqlClient(db),job={id:second,user_id:a,scheduled_at:'2026-10-03T12:00:00Z',profile_snapshot:PERSONAL_DEFAULTS};
    const options={now:new Date('2026-10-03T12:00:00Z'),soundcloudToken:null,throttleMs:0,
      sources:[{id:'musicbrainz-live',kind:'musicbrainz-recordings',enabled:true,maxRequests:1,maxItems:5},
        {id:'soundcloud-live',kind:'soundcloud-tracks',enabled:true,maxRequests:1,maxItems:5}],
      fetcher:async()=>({ok:true,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify({count:1,recordings:[{
        id:mbid,title:'Identity Test','first-release-date':releaseDate,'artist-credit':[{name:'Alias',artist:{id:mbid,name:'Full Name'}}],
        releases:[{id:mbid,title:'Edition',date:'2026-09'}]}]})})};
    const run=await researchPersonalJob(client,job,options);assert.equal(run.tracks.length,0);
    assert.equal((await db.query('select status from dp_research_runs where id=$1',[run.runId])).rows[0].status,'partial');
    assert.equal((await db.query('select credited_name from dp_music_credits')).rows[0].credited_name,'Alias');
    assert.equal((await db.query('select date_precision from dp_music_editions')).rows[0].date_precision,'month');
    releaseDate='2026-09-22';await researchPersonalJob(client,job,options);
    assert.equal((await db.query('select identity_status from dp_research_candidates')).rows[0].identity_status,'conflict');
    assert.equal((await db.query('select * from dp_music_evidence')).rows.length,2);
    await researchPersonalJob(client,job,options);assert.equal((await db.query('select * from dp_music_evidence')).rows.length,2);
    await db.exec('set role service_role');await assert.rejects(db.query("update dp_music_evidence set verification='verified'"),/permission denied/);await db.exec('reset role');
    await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
    assert.ok((await db.query('select user_id from dp_recommendation_history')).rows.every(r=>r.user_id===a));
    await assert.rejects(filter(b,[t]),/permission denied/);
    await assert.rejects(db.query('select * from dp_music_evidence'),/permission denied/);
    await db.exec('select dp_clear_personal_data()');assert.equal((await db.query('select * from dp_recommendation_history')).rows.length,0);
    await db.exec('reset role');assert.equal((await filter(b,[t])).length,0);
  }finally{await db.close();}
});
