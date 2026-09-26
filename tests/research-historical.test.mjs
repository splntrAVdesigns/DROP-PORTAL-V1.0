import test from 'node:test';
import assert from 'node:assert/strict';
import {validProfile,cleanProfile} from '../lib/contracts.js';
import {resolveSearchWindow,windowSlices} from '../lib/research-window.js';
import {discoverSource,normalizeSoundCloud} from '../lib/research.js';
import {rankCandidates} from '../lib/research-ranking.js';
import {runResearch} from '../lib/research-runtime.js';

const now=new Date('2026-09-25T16:00:00Z');
const profile={future:35,deep:40,jungle:25,depth:80,experimental:65,floor:60,darkness:75,breaks:70,count:12,mixes:true};
const mb={id:'12345678-1234-1234-1234-123456789abc',title:'Archive Tune',
  'artist-credit':[{name:'Artist'}],'first-release-date':'2026-02-12'};
const source={id:'mb-underground',kind:'musicbrainz-recordings',name:'MB',enabled:true,queries:['jungle'],limitPerQuery:1};

test('profile migration defaults to one month and rejects invalid historical options',()=>{
  assert.equal(validProfile(profile),true);
  assert.equal(cleanProfile(profile).searchPast,'1mo');
  assert.equal(validProfile({...profile,searchPast:'1yr'}),true);
  assert.equal(validProfile({...profile,searchPast:'all-time'}),false);
});
test('date planner covers all rolling windows and permits future year/era contracts',()=>{
  assert.deepEqual(['1mo','3mo','6mo','1yr'].map(v=>resolveSearchWindow(v,now).from),
    ['2026-08-25','2026-06-25','2026-03-25','2025-09-25']);
  const slices=windowSlices(resolveSearchWindow('1yr',now));
  assert.equal(slices[0].from,'2025-09-25');
  assert.equal(slices.at(-1).to,'2026-09-25');
  assert.equal(slices.length,13);
  assert.deepEqual(resolveSearchWindow({kind:'year',year:1996},now),
    {kind:'year',year:1996,from:'1996-01-01',to:'1996-12-31'});
  assert.equal(windowSlices(resolveSearchWindow({kind:'era',fromYear:1993,toYear:1995},now)).length,36);
  assert.equal(resolveSearchWindow('1mo',new Date('2026-03-31T18:00:00Z')).from,'2026-02-28');
});
test('MusicBrainz paginates monthly partitions and reports capped coverage',async()=>{
  const calls=[];
  const fetcher=async url=>{
    calls.push(new URL(url));
    const offset=Number(url.searchParams.get('offset'));
    const record={...mb,id:offset?'12345678-1234-1234-1234-123456789abd':mb.id};
    return {ok:true,text:async()=>JSON.stringify({count:3,recordings:[record]})};
  };
  const result=await discoverSource(source,{fetcher,now,window:resolveSearchWindow('1yr',now),throttleMs:0});
  assert.equal(result.coverage.length,13);
  assert.equal(calls.length,26);
  assert.equal(result.coverage.every(c=>c.state==='truncated'),true);
  assert.equal(result.state,'truncated');
  assert.equal(result.candidates.length,2);
  assert.match(calls[0].searchParams.get('query'),/2025-09-25 TO 2025-09-30/);
});
test('SoundCloud uses official upload-date query and safe linked pagination, retaining URNs',async()=>{
  const sc={urn:'soundcloud:tracks:2833445577',title:'Archive Tune',metadata_artist:'Artist',
    created_at:'2026-09-21T13:00:00Z',permalink_url:'https://soundcloud.com/artist/archive-tune'};
  const urlList=[];
  const fetcher=async url=>{
    urlList.push(new URL(url));
    return {ok:true,text:async()=>JSON.stringify(urlList.length===1?{
      collection:[sc],next_href:'https://api.soundcloud.com/tracks?cursor=next'
    }:{collection:[],next_href:null})};
  };
  const s={id:'sc-underground',kind:'soundcloud-tracks',name:'SC',enabled:true,queries:['jungle'],limitPerQuery:10};
  const result=await discoverSource(s,{fetcher,now,window:{from:'2026-09-01',to:'2026-09-25'},soundcloudToken:'test'});
  assert.equal(result.candidates[0].providerIds.soundcloud,sc.urn);
  assert.equal(result.candidates[0].releaseDate,null);
  assert.equal(result.candidates[0].dateBasis,'upload-only');
  assert.equal(urlList[0].searchParams.get('created_at[from]'),'2026-09-01 00:00:00');
  assert.equal(urlList[1].searchParams.get('cursor'),'next');
  assert.equal(normalizeSoundCloud({...sc,urn:'soundcloud:users:1'},s,now),null);
});
test('depth changes ranking without inventing audio quality; repeat is penalized',()=>{
  const window=resolveSearchWindow('1yr',now);
  const recent={artistName:'Artist One',title:'Recent',releaseDate:'2026-09-22',sourceIds:['musicbrainz-dnb'],
    evidence:[{url:'https://musicbrainz.org/recording/x'}]};
  const old={artistName:'Artist Two',title:'Older',releaseDate:'2025-10-02',sourceIds:['musicbrainz-dnb'],
    evidence:[{url:'https://musicbrainz.org/recording/y'}]};
  const familiar=rankCandidates([recent,old],{profile:{depth:0},window});
  const deep=rankCandidates([recent,old],{profile:{depth:100},window});
  assert.equal(familiar[0].title,'Recent');
  assert.equal(deep[0].title,'Older');
  assert.equal(deep[0].ranking.note.includes('Audio quality'),true);
  const repeat=rankCandidates([recent,old],{profile:{depth:0},window,archive:[{tracks:[recent]}]});
  assert.equal(repeat.find(c=>c.title==='Recent').ranking.repeated,true);
  assert.equal(repeat[0].title,'Older');
});
test('dry run reads the effective This Week profile, archive, and exact schedule snapshot without writes',async()=>{
  const head='a'.repeat(40),date='2026-09-25',profileOverride={...profile,searchPast:'3mo',depth:90};
  const files={
    'weekly-schedule/current.json':{schemaVersion:1,timezone:'America/Chicago',defaultSchedule:{weekday:'WEDNESDAY',time:'19:00'},
      override:{mode:'one-off',date,time:'21:00'},nextDropAt:'2026-09-26T02:00:00.000Z',status:'armed'},
    'weekly-inquiry/current.json':{schemaVersion:1,status:'queued',updatedAt:'2026-09-25T13:00:00Z',
      targetDropDate:date,baseProfile:profile,weeklyOverride:profileOverride},
    'research/sources.json':{schemaVersion:1,sources:[source]},
    'research/queue.json':{schemaVersion:1,updatedAt:null,candidates:[],runs:[]},
    'weekly-feed/drops/index.json':{schemaVersion:1,drops:[{url:'./2026-09-23.json',status:'published'}]},
    'weekly-feed/drops/2026-09-23.json':{tracks:[{artistName:'Other Artist',title:'Other Tune'}]}
  };
  const original=globalThis.fetch,oldToken=process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN='test-only-token';
  globalThis.fetch=async(url,options={})=>{
    assert.equal(options.method||'GET','GET','dry run cannot commit');
    const path=new URL(url).pathname.split('DROP-PORTAL-V1.0/')[1];
    if(path==='git/ref/heads/main')return {ok:true,json:async()=>({object:{sha:head}})};
    assert.equal(new URL(url).searchParams.get('ref'),head);
    const file=files[path.slice('contents/'.length)];
    assert.ok(file,path);
    return {ok:true,json:async()=>({content:Buffer.from(JSON.stringify(file)).toString('base64')})};
  };
  try{
    const report=await runResearch({dryRun:true,now,throttleMs:0,fetcher:async()=>({
      ok:true,text:async()=>JSON.stringify({recordings:[{...mb,'first-release-date':'2026-08-12'}],count:1})
    })});
    assert.equal(report.status,'dry_run');
    assert.equal(report.window.from,'2026-06-25');
    assert.equal(report.profileSnapshot.source,'weeklyOverride');
    assert.equal(report.profileSnapshot.depth,90);
    assert.equal(report.captured.nextDropAt,'2026-09-26T02:00:00.000Z');
    assert.equal(report.eligible,1);
    assert.ok(report.sources[0].coverage.some(c=>c.matched===1));
  }finally{
    globalThis.fetch=original;
    if(oldToken===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=oldToken;
  }
});
