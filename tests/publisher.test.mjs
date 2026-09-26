import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import scheduleHandler from '../api/schedule.js';
import inquiryHandler from '../api/inquiry.js';
import dropSettingsHandler from '../api/drop-settings.js';
const initial={schedule:JSON.parse(fs.readFileSync('weekly-schedule/current.json')),inquiry:JSON.parse(fs.readFileSync('weekly-inquiry/current.json'))};
process.env.DROP_PORTAL_ADMIN_KEY='test-only-key';process.env.GITHUB_TOKEN='test-only-token';
function mockRepo({race=false}={}) {
  let state=structuredClone(initial),head='a'.repeat(40),tree,mutations=0;
  globalThis.fetch=async(url,options={})=>{
    const path=new URL(url).pathname.split('DROP-PORTAL-V1.0/')[1],method=options.method||'GET';
    let body;
    if(method==='GET'&&path==='git/ref/heads/main')body={object:{sha:head}};
    else if(method==='GET'&&path.startsWith('contents/')){
      assert.equal(new URL(url).searchParams.get('ref'),head);
      const value=path.includes('weekly-inquiry')?state.inquiry:state.schedule;
      body={content:Buffer.from(JSON.stringify(value)).toString('base64')};
    } else if(method==='GET'&&path.startsWith('git/commits/'))body={tree:{sha:'base-tree'}};
    else if(method==='POST'&&path==='git/trees'){tree=JSON.parse(options.body).tree;body={sha:'next-tree'};}
    else if(method==='POST'&&path==='git/commits'){assert.deepEqual(JSON.parse(options.body).parents,[head]);body={sha:'b'.repeat(40)};}
    else if(method==='PATCH'){
      assert.equal(JSON.parse(options.body).force,false);
      if(race)return {ok:false,status:422,json:async()=>({message:'Not a fast forward'})};
      for(const entry of tree)state[entry.path.includes('weekly-inquiry')?'inquiry':'schedule']=JSON.parse(entry.content);
      mutations++;head='b'.repeat(40);body={object:{sha:head}};
    }else throw Error('Unexpected request '+method+' '+path);
    return {ok:true,json:async()=>body};
  };
  return {get state(){return state;},get mutations(){return mutations;}};
}
async function call(handler,body,method='POST',key='test-only-key') {
  let code,result;const res={status(c){code=c;return this;},setHeader(){},json(b){result=b;}};
  await handler({method,body,headers:{'x-drop-portal-admin-key':key}},res);return {code,result};
}
test('canonical GET returns both settings at one revision',async()=>{mockRepo();const r=await call(inquiryHandler,null,'GET');assert.equal(r.code,200);assert.deepEqual(r.result.inquiry,initial.inquiry);assert.ok(r.result.schedule);});
test('schedule save commits date and inquiry target together; readback agrees',async()=>{
  const repo=mockRepo();const r=await call(scheduleHandler,{date:'2030-09-25',time:'19:00',mode:'one-off',expectedRevision:'a'.repeat(40)});
  assert.equal(r.code,200);assert.equal(repo.mutations,1);assert.equal(repo.state.inquiry.targetDropDate,'2030-09-25');assert.equal(repo.state.schedule.override.mode,'one-off');assert.deepEqual(repo.state.inquiry.baseProfile,initial.inquiry.baseProfile);
  const read=await call(scheduleHandler,null,'GET');assert.deepEqual(read.result.inquiry,r.result.inquiry);assert.equal(read.result.revision,r.result.revision);
});
test('base saves preserve the weekly override and weekly clear restores base',async()=>{
  let repo=mockRepo();const profile={...initial.inquiry.baseProfile,deep:91};
  let r=await call(inquiryHandler,{scope:'base',profile,expectedRevision:'a'.repeat(40)});assert.equal(r.code,200);assert.equal(repo.state.inquiry.baseProfile.deep,91);assert.deepEqual(repo.state.inquiry.weeklyOverride,initial.inquiry.weeklyOverride);
  repo=mockRepo();r=await call(inquiryHandler,{scope:'weekly',clear:true,expectedRevision:'a'.repeat(40)});assert.equal(r.code,200);assert.equal(repo.state.inquiry.status,'base-only');assert.equal(repo.state.inquiry.weeklyOverride,null);
});
test('stale revision, simultaneous commit, and unauthenticated saves cannot overwrite state',async()=>{
  let repo=mockRepo();let r=await call(inquiryHandler,{scope:'base',profile:initial.inquiry.baseProfile,expectedRevision:'stale'});assert.equal(r.code,409);assert.equal(repo.mutations,0);
  repo=mockRepo({race:true});r=await call(scheduleHandler,{date:'2030-09-25',time:'19:00',mode:'weekly-default',expectedRevision:'a'.repeat(40)});assert.equal(r.code,409);assert.equal(repo.mutations,0);
  repo=mockRepo();r=await call(inquiryHandler,{},'POST','wrong');assert.equal(r.code,401);assert.equal(repo.mutations,0);
});

test('one-click save atomically records This Week tuning and next-drop schedule',async()=>{
  const repo=mockRepo();
  const profile={...initial.inquiry.baseProfile,deep:91,jungle:63,depth:78};
  const r=await call(dropSettingsHandler,{
    scope:'weekly',profile,date:'2030-09-25',time:'19:00',mode:'one-off',expectedRevision:'a'.repeat(40)
  });
  assert.equal(r.code,200);
  assert.equal(repo.mutations,1,'one atomic commit, not two independent saves');
  assert.equal(repo.state.inquiry.status,'queued');
  assert.deepEqual(repo.state.inquiry.weeklyOverride,{...profile,searchPast:'1mo'});
  assert.equal(repo.state.inquiry.targetDropDate,'2030-09-25');
  assert.equal(repo.state.schedule.override.mode,'one-off');
  assert.equal(repo.state.schedule.nextDropAt,'2030-09-26T00:00:00.000Z');
  assert.deepEqual(repo.state.inquiry.baseProfile,initial.inquiry.baseProfile);
  const read=await call(scheduleHandler,null,'GET');
  assert.equal(read.result.revision,r.result.revision);
  assert.deepEqual(read.result.schedule,r.result.schedule);
  assert.deepEqual(read.result.inquiry,r.result.inquiry);
});
test('combined Base save retains existing This Week override; invalid dates never write',async()=>{
  let repo=mockRepo();
  const profile={...initial.inquiry.baseProfile,future:84};
  let r=await call(dropSettingsHandler,{
    scope:'base',profile,date:'2030-09-25',time:'20:00',mode:'weekly-default',expectedRevision:'a'.repeat(40)
  });
  assert.equal(r.code,200);
  assert.equal(repo.mutations,1);
  assert.equal(repo.state.inquiry.baseProfile.future,84);
  assert.deepEqual(repo.state.inquiry.weeklyOverride,initial.inquiry.weeklyOverride);
  assert.equal(repo.state.schedule.defaultSchedule.weekday,'WEDNESDAY');
  repo=mockRepo();
  r=await call(dropSettingsHandler,{
    scope:'weekly',profile,date:'2030-02-30',time:'19:00',mode:'one-off',expectedRevision:'a'.repeat(40)
  });
  assert.equal(r.code,400);
  assert.equal(repo.mutations,0);
});
test('combined saves reject stale versions and unconfigured production writes',async()=>{
  let repo=mockRepo();
  const args={scope:'weekly',profile:initial.inquiry.baseProfile,date:'2030-09-25',time:'19:00',mode:'one-off',expectedRevision:'stale'};
  let r=await call(dropSettingsHandler,args);assert.equal(r.code,409);assert.equal(repo.mutations,0);
  const previousKey=process.env.DROP_PORTAL_ADMIN_KEY;
  const previousToken=process.env.GITHUB_TOKEN;
  try{
    delete process.env.DROP_PORTAL_ADMIN_KEY;
    delete process.env.GITHUB_TOKEN;
    repo=mockRepo();
    r=await call(dropSettingsHandler,args);
    assert.equal(r.code,503);
    assert.equal(repo.mutations,0);
    const read=await call(inquiryHandler,null,'GET');
    assert.equal(read.code,200);
    assert.equal(read.result.publisherConfigured,false);
  }finally{
    process.env.DROP_PORTAL_ADMIN_KEY=previousKey;
    process.env.GITHUB_TOKEN=previousToken;
  }
});
