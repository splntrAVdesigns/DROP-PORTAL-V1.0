import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {PERSONAL_DEFAULTS} from '../lib/personal-contracts.js';
import {nextPersonalOccurrence} from '../lib/personal-discovery.js';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
test('atomic weekly queue rejects stale plans; retries and health remain private',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
 for(const file of ['001_personal_discovery','003_personal_drops','004_one_time_replacement','005_personal_drop_reliability'])await db.exec(await readFile(new URL('../db/migrations/'+file+'.sql',import.meta.url),'utf8'));
 const now=new Date(),due=new Date(+now-7*86400000),weekday=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short'}).format(due).replace(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/g,x=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(x)));
 const next=nextPersonalOccurrence(weekday,'12:00',now);
 await db.query('insert into dp_personal_profiles(user_id,base_profile) values($1,$2::jsonb)',[a,JSON.stringify(PERSONAL_DEFAULTS)]);
 await db.query('insert into dp_personal_plans(user_id,weekday,local_time,next_drop_at) values($1,$2,$3,$4)',[a,weekday,'12:00',due.toISOString()]);
 const queue=revision=>db.query('select dp_queue_due_weekly($1,$2,$3,$4) as ok',[a,revision,due.toISOString(),next.toISOString()]);
 assert.equal((await queue(2)).rows[0].ok,false);assert.equal((await queue(1)).rows[0].ok,true);assert.equal((await queue(1)).rows[0].ok,false);
 const job=(await db.query('select * from dp_personal_drops')).rows[0];assert.deepEqual(job.profile_snapshot,PERSONAL_DEFAULTS);
 assert.equal((await db.query('select revision from dp_personal_plans')).rows[0].revision,2);
 await db.query("update dp_personal_drops set status='failed' where id=$1",[job.id]);
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
 await assert.rejects(db.query('select * from dp_retry_personal_drop($1)',[job.id]),/cannot be retried/);
 await assert.rejects(db.query('select * from dp_worker_runs'),/permission denied/);
 await assert.rejects(queue(1),/permission denied/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
 assert.equal((await db.query('select * from dp_retry_personal_drop($1)',[job.id])).rows[0].retry_count,1);
 await assert.rejects(db.query('select * from dp_retry_personal_drop($1)',[job.id]),/cannot be retried/);
 const at=new Date(+now+600000).toISOString();const request=()=>db.query('select * from dp_request_one_time($1,$2::jsonb)',[at,JSON.stringify(PERSONAL_DEFAULTS)]);
 assert.equal((await request()).rows[0].id,(await request()).rows[0].id);
 }finally{await db.close();}
});
