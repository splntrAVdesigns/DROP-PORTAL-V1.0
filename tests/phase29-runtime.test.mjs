import test from 'node:test';
import assert from 'node:assert/strict';
import {captureOccurrence,effectiveProfile} from '../lib/pipeline.js';
import {stageCandidate,publishStaged,pipelineStatus} from '../lib/pipeline-runtime.js';
const schedule={schemaVersion:1,timezone:'America/Chicago',
 defaultSchedule:{weekday:'WEDNESDAY',time:'19:00'},override:{mode:'one-off',date:'2030-09-25',time:'21:00'},
 nextDropAt:'2030-09-26T02:00:00.000Z',status:'armed',updatedAt:'2030-09-24T00:00:00Z',lastPublishedAt:null};
const profile={future:25,deep:70,jungle:65,depth:65,experimental:55,floor:55,darkness:70,breaks:70,count:12,mixes:true};
const inquiry={schemaVersion:1,status:'queued',targetDropDate:'2030-09-25',updatedAt:'2030-09-25T01:30:00Z',
 baseProfile:{...profile,future:35,deep:40,jungle:25,depth:80},
 weeklyOverride:profile};
const manifest={schemaVersion:1,updatedAt:'2026-09-24T00:00:00Z',
 drops:[{id:'004',publishedAt:'2026-09-23T23:00:00Z',status:'published',url:'./2026-09-23.json'}]};
const archived={schemaVersion:1,tracks:[{id:'do-not-repeat'}]};
function candidate(){
 const tracks=Array.from({length:12},(_,i)=>{
  const id='new-verified-track-'+i,url='https://example'+i+'.bandcamp.com/track/'+id;
  return {id,artistName:'Artist '+i,title:'Title '+i,release:'Album',label:'Record label',
   releaseDate:'2030-09-25',subgenre:'Deep Drum and Bass',reason:'Research-backed candidate pending individual audio evaluation',
   lane:i%3,score:82,confidence:78,preview:null,links:[{kind:'store-listening',url}],
   startHere:i<3,priority:i+1};
 });
 return {captured:captureOccurrence(schedule,inquiry),profileSnapshot:effectiveProfile(schedule,inquiry),
  tracks,mixes:[],sources:tracks.map(t=>t.links[0].url),
  evidence:Object.fromEntries(tracks.map(t=>[t.id,{sourceUrl:t.links[0].url,
   fields:['artistName','title','releaseDate','label']}]))};
}
function repoMock({race=false}={}){
 let head='a'.repeat(40),seq=0,commits=0,tree=null;
 let files={
  'weekly-schedule/current.json':structuredClone(schedule),
  'weekly-inquiry/current.json':structuredClone(inquiry),
  'weekly-feed/drops/index.json':structuredClone(manifest),
  'weekly-feed/drops/2026-09-23.json':structuredClone(archived)
 };
 process.env.GITHUB_TOKEN='phase29-test-only';
 globalThis.fetch=async(url,options={})=>{
  const p=new URL(url).pathname.split('DROP-PORTAL-V1.0/')[1],method=options.method||'GET';
  if(!p)throw Error('Unknown GitHub request '+url);
  let data,status=200;
  if(method==='GET'&&p==='git/ref/heads/main')data={object:{sha:head}};
  else if(method==='GET'&&p.startsWith('contents/')){
   const path=p.slice('contents/'.length);
   assert.equal(new URL(url).searchParams.get('ref'),head,'reads pinned to consistent revision');
   if(!(path in files)){status=404;data={message:'Not Found'};}
   else data={content:Buffer.from(JSON.stringify(files[path])).toString('base64'),encoding:'base64'};
  }else if(method==='GET'&&p.startsWith('git/commits/'))data={tree:{sha:'fake-tree'}};
  else if(method==='POST'&&p==='git/trees'){
   tree=JSON.parse(options.body).tree;data={sha:'next-tree'};
  }else if(method==='POST'&&p==='git/commits'){
   assert.deepEqual(JSON.parse(options.body).parents,[head]);
   data={sha:String(++seq).padStart(40,'b')};
  }else if(method==='PATCH'&&p==='git/refs/heads/main'){
   assert.equal(JSON.parse(options.body).force,false);
   if(race){status=422;data={message:'Fast-forward rejected'};}
   else{for(const entry of tree)files[entry.path]=JSON.parse(entry.content);
    head=JSON.parse(options.body).sha;commits++;data={object:{sha:head}};}
  }else throw Error('Unexpected GitHub operation '+method+' '+p);
  return{ok:status===200,status,json:async()=>data};
 };
 return{get files(){return files;},get commits(){return commits;},get head(){return head;},
  changeInquiry(){files['weekly-inquiry/current.json'].updatedAt='2030-09-25T01:31:00Z';}};
}
test('stage writes and re-reads exactly one path without touching live publication',async()=>{
 const mock=repoMock();
 let status=await pipelineStatus();assert.equal(status.status,'awaiting_research');
 const result=await stageCandidate(candidate(),new Date('2030-09-25T23:00:00Z'));
 assert.equal(result.status,'staged');
 assert.equal(result.trackCount,12);
 assert.equal(result.evidenceCount,12);
 assert.equal(mock.commits,1);
 assert.equal(mock.files['weekly-feed/drops/index.json'].drops.length,1);
 assert.ok(mock.files['ops/staged/2030-09-25.json']);
 status=await pipelineStatus();assert.equal(status.status,'staged');
 const again=await stageCandidate(candidate(),new Date('2030-09-25T23:02:00Z'));
 assert.equal(again.idempotent,true);
 assert.equal(mock.commits,1);
});
test('publication is one CAS commit covering payload+index+both rollover files',async()=>{
 const mock=repoMock();
 await stageCandidate(candidate(),new Date('2030-09-25T23:00:00Z'));
 let out=await publishStaged(new Date('2030-09-26T01:59:59Z'));
 assert.equal(out.status,'not_due');
 assert.equal(mock.commits,1);
 out=await publishStaged(new Date('2030-09-26T02:05:00Z'));
 assert.equal(out.status,'published');
 assert.equal(mock.commits,2);
 assert.equal(mock.files['weekly-feed/drops/index.json'].drops.length,2);
 assert.equal(mock.files['weekly-feed/drops/index.json'].drops[0].id,'005');
 assert.equal(mock.files['weekly-schedule/current.json'].status,'armed');
 assert.equal(mock.files['weekly-schedule/current.json'].override,null);
 assert.equal(mock.files['weekly-inquiry/current.json'].status,'base-only');
 assert.ok(mock.files['weekly-feed/drops/2030-09-25.json']);
 assert.deepEqual(mock.files['weekly-feed/drops/2026-09-23.json'],archived);
});
test('stage obsolete after Tuner edit; nothing is published',async()=>{
 const mock=repoMock();
 await stageCandidate(candidate(),new Date('2030-09-25T23:00:00Z'));
 mock.changeInquiry();
 await assert.rejects(()=>publishStaged(new Date('2030-09-26T02:05:00Z')),/obsolete/i);
 assert.equal(mock.commits,1);
});
test('non-forced push race does not write an orphaned payload or advance schedule',async()=>{
 const mock=repoMock({race:true});
 await assert.rejects(()=>stageCandidate(candidate(),new Date('2030-09-25T23:00:00Z')),/Fast-forward|changed/i);
 assert.equal(mock.commits,0);
 assert.equal(mock.files['weekly-feed/drops/index.json'].drops.length,1);
});
