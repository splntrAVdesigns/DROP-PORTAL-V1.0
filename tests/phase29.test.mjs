import test from 'node:test';
import assert from 'node:assert/strict';
import {
 effectiveProfile,captureOccurrence,createStage,validateStage,makePublication,
 isOfficialUrl,isSafeUrl,stagePath
} from '../lib/pipeline.js';
const schedule={schemaVersion:1,timezone:'America/Chicago',
 defaultSchedule:{weekday:'WEDNESDAY',time:'19:00'},
 override:{mode:'one-off',date:'2030-09-25',time:'21:00'},
 nextDropAt:'2030-09-26T02:00:00.000Z',status:'armed',
 updatedAt:'2030-09-24T00:00:00Z',lastPublishedAt:null};
const base={future:35,deep:40,jungle:25,depth:80,experimental:65,floor:60,darkness:75,breaks:70,count:12,mixes:true};
const weekly={...base,deep:70,jungle:65,future:25};
const inquiry={schemaVersion:1,status:'queued',updatedAt:'2030-09-25T01:30:00Z',
 targetDropDate:'2030-09-25',baseProfile:base,weeklyOverride:weekly};
const manifest={schemaVersion:1,updatedAt:'2026-09-24T00:00:00Z',drops:[{id:'004',status:'published',publishedAt:'2026-09-23T23:00:00Z',url:'./2026-09-23.json'}]};
const archive=[{tracks:[{id:'recent-track'}]}];
function candidate(){
 const tracks=Array.from({length:12},(_,i)=>{
  const id='phase29-track-'+(i+1),url='https://label'+(i+1)+'.bandcamp.com/track/'+id;
  return {id,artistName:'Verified Artist '+i,title:'Example '+i,release:'Example EP',
   label:'Example Label',releaseDate:'2030-09-24',reason:'Metadata-backed recommendation requiring audio review',
   subgenre:'Deep Drum & Bass',lane:i%3,score:90,confidence:75,preview:null,
   links:[{kind:'store-listening',url}],startHere:i<3,priority:i+1};
 });
 const sources=tracks.map(t=>t.links[0].url);
 const evidence=Object.fromEntries(tracks.map(t=>[t.id,{sourceUrl:t.links[0].url,
 fields:['artistName','title','releaseDate','label']}]));
 return {captured:captureOccurrence(schedule,inquiry),profileSnapshot:effectiveProfile(schedule,inquiry),
 tracks,mixes:[],sources,evidence};
}
const context={schedule,inquiry,manifest,archive};
test('queued This Week is used only for the exact local scheduled occurrence',()=>{
 assert.equal(effectiveProfile(schedule,inquiry).source,'weeklyOverride');
 assert.equal(effectiveProfile(schedule,inquiry).deep,70);
 assert.equal(effectiveProfile(schedule,{...inquiry,targetDropDate:'2030-09-26'}).source,'baseProfile');
});
test('validated stage is immutable candidate envelope with exact profile snapshot',()=>{
 const c=candidate(),s=createStage(c,context,new Date('2030-09-25T23:00:00Z'));
 assert.equal(s.status,'validated');
 assert.equal(s.candidate.tracks.length,12);
 assert.equal(s.candidate.tracks.filter(t=>t.startHere).length,3);
 assert.deepEqual(validateStage(s,context).captured,c.captured);
 assert.equal(stagePath('2030-09-25'),'ops/staged/2030-09-25.json');
});
test('stale inquiry and schedule prevent staging or publication',()=>{
 const c=candidate(),stage=createStage(c,context);
 assert.throws(()=>createStage(c,{...context,inquiry:{...inquiry,updatedAt:'2030-09-25T01:31:00Z'}}),/stale/);
 assert.throws(()=>validateStage(stage,{...context,schedule:{...schedule,nextDropAt:'2030-09-26T03:00:00Z'}}),/obsolete/);
});
test('no repeats, exactly 3 Top 3, strict official provenance and allowed embeds',()=>{
 let c=candidate();c.tracks[0].id='recent-track';c.evidence['recent-track']=c.evidence['phase29-track-1'];c.evidence['recent-track'].sourceUrl=c.tracks[0].links[0].url;
 assert.throws(()=>createStage(c,context),/recently published/);
 c=candidate();c.tracks[0].startHere=false;
 assert.throws(()=>createStage(c,context),/Exactly three/);
 c=candidate();c.tracks[0].preview={kind:'provider-embed',provider:'BANDCAMP',embedUrl:'https://example.net/untrusted/player'};
 assert.throws(()=>createStage(c,context),/unverified/);
 c=candidate();delete c.evidence['phase29-track-1'];
 assert.throws(()=>createStage(c,context),/evidence/);
 assert.equal(isOfficialUrl('https://label1.bandcamp.com/track/example'),true);
 assert.equal(isSafeUrl('https://127.0.0.1/private'),false);
});
test('valid plan publishes payload, manifest, archive and both rollovers together',()=>{
 const c=candidate(),s=createStage(c,context);
 const result=makePublication(s,context,new Date('2030-09-26T02:04:00Z'));
 assert.equal(result.id,'005');
 assert.equal(result.payload.tracks.length,12);
 assert.equal(result.index.drops[0].id,'005');
 assert.equal(result.index.drops[1].id,'004');
 assert.equal(result.rolledSchedule.override,null);
 assert.equal(result.rolledSchedule.defaultSchedule.weekday,'WEDNESDAY');
 assert.equal(result.rolledInquiry.status,'base-only');
 assert.equal(result.rolledInquiry.weeklyOverride,null);
 assert.equal(result.rolledInquiry.targetDropDate,'2030-10-02');
 assert.equal(result.rolledSchedule.lastPublishedAt,result.payload.drop.publishedAt);
});
test('publication gate blocks early and duplicate occurrences',()=>{
 const stage=createStage(candidate(),context);
 assert.throws(()=>makePublication(stage,context,new Date('2030-09-26T01:59:00Z')),/not due/);
 assert.throws(()=>makePublication(stage,{...context,manifest:{
  ...manifest,drops:[{id:'005',status:'published',url:'./2030-09-25.json'},...manifest.drops]
 }},new Date('2030-09-26T02:05:00Z')),/already published/);
});
