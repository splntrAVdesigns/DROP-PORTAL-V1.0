import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {PERSONAL_DEFAULTS} from '../lib/personal-contracts.js';
import {planPersonalResearch,validatePersonalSources} from '../lib/personal-research-plan.js';
import {createRequestBudget,runSourceAdapter,normalizeBandcampSearchHit,normalizeMixcloudShow} from '../lib/personal-research-adapters.js';
import {mergePersonalCandidates,eligibleResearchCandidate,researchTrack} from '../lib/personal-research-runtime.js';

const now=new Date('2026-10-02T18:00:00Z'),window={from:'2026-09-02',to:'2026-10-02'};
const plan={window,queries:[{kind:'artist',term:'Hidden Producer'}],maxRequests:10,deadlineMs:45000};
const source=(id,kind,maxRequests=2)=>({id,kind,enabled:true,maxRequests,maxItems:5});
const response=(body,status=200,type='application/json')=>({ok:status>=200&&status<300,status,
  headers:{get:()=>type},text:async()=>typeof body==='string'?body:JSON.stringify(body)});
const runner=async(s,fetcher,opts={})=>runSourceAdapter(s,{plan,budget:createRequestBudget({fetcher}),now,throttleMs:0,...opts});

test('planner respects taste and registry starts with no ready badge',async()=>{
  const p=planPersonalResearch({...PERSONAL_DEFAULTS,artists:['Hidden Producer'],labels:['Small Label']},now);
  assert.equal(p.queries[0].term,'Hidden Producer');assert.equal(p.queries[1].term,'Small Label');
  assert.ok(p.queries.length<=6&&p.maxRequests<=10);
  const config=JSON.parse(await readFile(new URL('../research/personal-sources.json',import.meta.url)));
  validatePersonalSources(config);assert.equal(config.sources.filter(s=>s.initialStatus==='ready').length,0);
  assert.throws(()=>validatePersonalSources({...config,sources:[{...config.sources[0],initialStatus:'ready'}]}));
});
test('MusicBrainz date precision, search truncation, and invalid release dates',async()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const rows=[{'id':id,title:'Deep Passage','artist-credit':[{name:'Hidden Producer'}],
    'first-release-date':'2026-09-20'},{id,title:'Month Only','artist-credit':[{name:'Hidden Producer'}],
    'first-release-date':'2026-09'},{id,title:'Invalid','artist-credit':[{name:'Hidden Producer'}],
    'first-release-date':'2026-09-31'}];
  const calls=[];const outcome=await runner(source('musicbrainz-live','musicbrainz-recordings'),async url=>{
    calls.push(url);return response({recordings:rows,count:100});
  });
  assert.equal(calls.length,2);assert.equal(outcome.candidates.length,1);
  assert.equal(outcome.coverage[0].state,'truncated');assert.equal(outcome.coverage[0].cursor,'6');
  assert.equal(outcome.candidates[0].evidence[0].claimPrecision,'day');
});
test('SoundCloud upload remains a lead; unsafe pagination and redirects cannot be fetched',async()=>{
  let calls=0;const track={id:123,title:'Deep Passage',metadata_artist:'Hidden Producer',created_at:'2026-09-21T12:00:00Z',
    permalink_url:'https://soundcloud.com/hidden/deep-passage'};
  const result=await runner(source('soundcloud-live','soundcloud-tracks'),async()=>{calls++;return response({collection:[track],next_href:'https://evil.example/tracks'});},{soundcloudToken:'fake'});
  assert.equal(calls,1);assert.equal(result.coverage[0].state,'error');assert.equal(result.candidates[0].releaseDate,null);
  assert.equal(result.candidates[0].evidence[0].claimType,'upload');
  const redirected=await runner(source('soundcloud-live','soundcloud-tracks'),async()=>response('',302),{soundcloudToken:'fake'});
  assert.equal(redirected.coverage[0].state,'error');
  assert.equal((await runner(source('soundcloud-live','soundcloud-tracks'),async()=>{throw Error('Should not call');})).state,'access-blocked');
});
test('indexed Bandcamp links remain leads; malformed, removed and redirected search results do not select',async()=>{
  const page='https://tiny-label.bandcamp.com/album/deep-passage';
  const s=source('bandcamp-indexed','bandcamp-indexed');
  let requests=0;
  const results=await runner(s,async url=>{requests++;assert.equal(url.hostname,'api.search.brave.com');return response({web:{results:[
    {url:page,title:'Deep Passage | Hidden Producer'},{url:'https://evil.example/album/fake',title:'Fake | Bad'}],more_results:true}});},{braveKey:'fake'});
  assert.equal(requests,1);assert.equal(results.requests,1);assert.equal(results.candidates.length,1);
  assert.equal(results.candidates[0].dateBasis,'lead');assert.equal(results.candidates[0].releaseDate,null);
  assert.equal(normalizeBandcampSearchHit({url:page,title:'Malformed'},s,now),null);
  assert.equal(normalizeBandcampSearchHit({url:'https://evil.example/album/fake',title:'Fake | Bad'},s,now),null);
  assert.equal(normalizeBandcampSearchHit({url:page,title:'Deep Passage | Hidden Producer',datePublished:'2026-09-20'},s,now).releaseDate,null);
  for(const status of [302,404]){
    const bad=await runner(s,async()=>response('',status),{braveKey:'fake'});
    assert.equal(bad.candidates.length,0);assert.equal(bad.coverage[0].state,'error');
  }
});
test('Mixcloud pagination and tracklists are leads, never verified release dates',async()=>{
  const s=source('mixcloud-leads','mixcloud-shows');
  const show={url:'https://www.mixcloud.com/selector/rare-mix/',name:'Rare Mix',user:{name:'Selector'},
    sections:[{artist:'Hidden Producer',song:'Deep Passage'}]};
  const result=await runner(s,async()=>response({data:[show],paging:{next:'https://api.mixcloud.com/search/?page=2'}}));
  assert.equal(result.coverage[0].state,'truncated');assert.equal(result.candidates[0].releaseDate,null);
  assert.equal(normalizeMixcloudShow({url:'https://www.mixcloud.com/selector/rare-mix/',name:'Rare Mix',user:{name:'Selector'}},s,now)[0].flags[0],'show_only');
  assert.equal(normalizeMixcloudShow({...show,url:'http://www.mixcloud.com/selector/rare-mix/'},s,now).length,0);
  const bad=await runner(s,async()=>response({data:[],paging:{next:'https://evil.example'}}));assert.equal(bad.coverage[0].state,'error');
});
test('corroborated release plus a listening link is eligible; conflicting dates are withheld',()=>{
  const release={id:'research-aaaaaaaaaaaaaaaaaaaaaaaa',identityKey:'hidden producer|deep passage',artistName:'Hidden Producer',title:'Deep Passage',releaseDate:'2026-09-20',
    dateBasis:'confirmed-release',datePrecision:'day',destinations:[{kind:'metadata',url:'https://musicbrainz.org/recording/123'}],evidence:[{sourceId:'mb',url:'https://musicbrainz.org/recording/123'}]};
  const upload={...release,id:'research-bbbbbbbbbbbbbbbbbbbbbbbb',releaseDate:null,dateBasis:'upload-only',datePrecision:'unknown',
    destinations:[{kind:'listen',url:'https://soundcloud.com/hidden/deep'}],evidence:[{sourceId:'sc',url:'https://soundcloud.com/hidden/deep'}]};
  assert.equal(eligibleResearchCandidate(upload,window),false);
  const merged=mergePersonalCandidates([release,upload])[0];assert.equal(eligibleResearchCandidate(merged,window),true);
  assert.equal(researchTrack(merged).links[0].kind,'listen');
  assert.equal(eligibleResearchCandidate(mergePersonalCandidates([release,{...release,id:'research-cccccccccccccccccccccccc',releaseDate:'2026-09-21'}])[0],window),false);
});
test('migration links private runs to drops and hides source facts from authenticated users',async()=>{
  const db=new PGlite();try{
    const a='11111111-1111-4111-8111-111111111111';
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
    for(const filename of ['001_personal_discovery','003_personal_drops','004_one_time_replacement','005_personal_drop_reliability','007_weekly_drop_sequence','008_research_foundation'])
      await db.exec(await readFile(new URL('../db/migrations/'+filename+'.sql',import.meta.url),'utf8'));
    const drop=(await db.query("insert into dp_personal_drops(user_id,kind,status,scheduled_at,profile_snapshot) values($1,'weekly','queued','2026-10-02','{}') returning id",[a])).rows[0].id;
    const run=(await db.query("insert into dp_research_runs(user_id,drop_id,status,window_from,window_to) values($1,$2,'running','2026-09-02','2026-10-02') returning id",[a,drop])).rows[0].id;
    await db.query('update dp_personal_drops set research_run_id=$1 where id=$2',[run,drop]);
    await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
    assert.equal((await db.query('select * from dp_research_runs')).rows.length,1);
    await assert.rejects(db.query('select * from dp_research_candidates'),/permission denied/);
    await assert.rejects(db.query('select * from dp_research_cursors'),/permission denied/);
    await db.exec('select dp_clear_personal_data()');assert.equal((await db.query('select * from dp_research_runs')).rows.length,0);
  }finally{await db.close();}
});
