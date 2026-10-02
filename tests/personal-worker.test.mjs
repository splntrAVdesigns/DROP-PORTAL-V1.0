import test from 'node:test';
import assert from 'node:assert/strict';
import {runPersonalWorker} from '../api/personal-worker.js';
import {PERSONAL_DEFAULTS} from '../lib/personal-contracts.js';

// In-memory PostgREST double evaluates filters at mutation time, including CAS claims.
function database(seed){
  const tables=structuredClone(seed);let seq=0;
  return {tables,from(table){
    const filters=[];let mode='read',values,returnRows=false,max=Infinity,sort=null,single=false;
    const q={select(){returnRows=true;return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},lt(k,v){filters.push(r=>r[k]<v);return q;},lte(k,v){filters.push(r=>r[k]<=v);return q;},
      order(k){sort=k;return q;},limit(n){max=n;return q;},single(){single=true;return q;},
      update(v){mode='update';values=v;return q;},upsert(v){mode='upsert';values=v;return q;},
      then(resolve,reject){return Promise.resolve().then(()=>{
        const rows=tables[table]||=[];
        if(mode==='upsert'){
          if(!rows.some(r=>r.user_id===values.user_id&&r.kind===values.kind&&r.scheduled_at===values.scheduled_at))rows.push({id:'job-'+(++seq),status:'queued',attempts:0,...values});
          return {data:null,error:null};
        }
        let selected=rows.filter(r=>filters.every(f=>f(r)));if(sort)selected.sort((a,b)=>String(a[sort]).localeCompare(String(b[sort])));selected=selected.slice(0,max);
        if(mode==='update')selected.forEach(r=>Object.assign(r,values));
        const data=structuredClone(selected);return {data:single?data[0]:returnRows?data:null,error:null};
      }).then(resolve,reject);}
    };return q;
  }};
}
const now=new Date('2026-10-02T02:00:00.000Z');
const profile={...PERSONAL_DEFAULTS,count:10};
const tracks=Array.from({length:12},(_,i)=>({id:'t-'+i,artistName:'A'+i,title:'Track '+i,label:'L',lane:i%3,score:80,releaseDate:'2026-09-20',links:[{kind:'listen',url:'https://example.com/'+i}]}));
const job=(id,user,extra={})=>({id,user_id:user,kind:'one_time',scheduled_at:now.toISOString(),status:'queued',attempts:0,profile_snapshot:profile,...extra});
const seed=drops=>({dp_personal_drops:drops,dp_personal_plans:[],dp_personal_profiles:[],dp_feedback:[]});

test('two concurrent workers publish a due one-time job once and leave future jobs queued',async()=>{
  const db=database(seed([job('a','A'),job('b','B',{scheduled_at:'2026-10-03T02:00:00.000Z'})]));
  const results=await Promise.all([runPersonalWorker(db,{now,catalogLoader:async()=>[{tracks}]}),runPersonalWorker(db,{now,catalogLoader:async()=>[{tracks}]})]);
  assert.equal(results.reduce((n,r)=>n+r.ready,0),1);
  assert.equal(db.tables.dp_personal_drops[0].attempts,1);
  assert.equal(db.tables.dp_personal_drops[1].status,'queued');
  assert.equal(db.tables.dp_personal_plans.length,0);
});

test('worker recovers abandoned jobs and limits interruption retries',async()=>{
  const db=database(seed([job('a','A',{status:'running',attempts:1,updated_at:'2026-10-02T01:00:00Z'}),job('b','B',{status:'running',attempts:3,updated_at:'2026-10-02T01:00:00Z'})]));
  const result=await runPersonalWorker(db,{now,catalogLoader:async()=>[{tracks}]});
  assert.equal(result.recovered,2);assert.equal(result.ready,1);
  assert.equal(db.tables.dp_personal_drops[0].attempts,2);
  assert.equal(db.tables.dp_personal_drops[1].status,'needs_research');
});

test('weekly processing snapshots each owner taste and advances recurrence independently',async()=>{
  const data=seed([]);
  data.dp_personal_plans=['A','B'].map(user_id=>({user_id,weekday:4,local_time:'21:00',next_drop_at:now.toISOString(),revision:1}));
  data.dp_personal_profiles=['A','B'].map((user_id,i)=>({user_id,base_profile:profile,weekly_profile:{...profile,artists:['A'+i]},target_date:'2026-10-01'}));
  const db=database(data);const result=await runPersonalWorker(db,{now,catalogLoader:async()=>[{tracks}]});
  assert.equal(result.ready,2);
  for(const [i,row] of db.tables.dp_personal_drops.entries())assert.equal(row.result.tracks[0].artistName,'A'+i);
  assert.ok(db.tables.dp_personal_plans.every(p=>p.next_drop_at==='2026-10-09T02:00:00.000Z'));
  await runPersonalWorker(db,{now,catalogLoader:async()=>[{tracks}]});assert.equal(db.tables.dp_personal_drops.length,2);
});

test('catalog failure leaves retryable work and a visible error summary',async()=>{
  const db=database(seed([job('a','A')]));
  const result=await runPersonalWorker(db,{now,catalogLoader:async()=>{throw Error('offline');}});
  assert.equal(result.errors.length,1);assert.equal(db.tables.dp_personal_drops[0].status,'queued');
});
