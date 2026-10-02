import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {weeklyDropCode} from '../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/weekly-drop-code.js';
import {waveformMarkup} from '../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/listening-waveform.js';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
test('weekly identifiers format durable numbers and waveform spans the full display',()=>{
 assert.equal(weeklyDropCode({kind:'weekly',weekly_sequence:1}),'DROP001');
 assert.equal(weeklyDropCode({kind:'weekly',weekly_sequence:1000}),'DROP1000');
 for(const d of [null,{kind:'one_time',weekly_sequence:1},{kind:'weekly',weekly_sequence:0},{kind:'weekly',weekly_sequence:'1'}])assert.equal(weeklyDropCode(d),'');
 assert.match(waveformMarkup(),/gradientUnits="userSpaceOnUse".*x2="640"/);
});
test('weekly catalog backfills in order, isolates accounts, survives retries and rolls back atomically',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
 for(const name of ['001_personal_discovery','003_personal_drops','004_one_time_replacement','005_personal_drop_reliability'])await db.exec(await readFile(new URL('../db/migrations/'+name+'.sql',import.meta.url),'utf8'));
 const insert=async(user,kind,status,date)=>(await db.query('insert into dp_personal_drops(user_id,kind,status,scheduled_at,profile_snapshot) values($1,$2,$3,$4,\'{}\') returning *',[user,kind,status,date])).rows[0];
 const later=await insert(a,'weekly','ready','2026-09-25'),earlier=await insert(a,'weekly','ready','2026-09-18');
 await db.exec(await readFile(new URL('../db/migrations/007_weekly_drop_sequence.sql',import.meta.url),'utf8'));
 const get=async id=>(await db.query('select weekly_sequence from dp_personal_drops where id=$1',[id])).rows[0].weekly_sequence;
 assert.equal(await get(earlier.id),1);assert.equal(await get(later.id),2);
 assert.equal((await insert(a,'one_time','ready','2026-10-02')).weekly_sequence,null);
 const retry=await insert(a,'weekly','failed','2026-10-02');assert.equal(retry.weekly_sequence,null);
 await db.query("update dp_personal_drops set status='ready' where id=$1",[retry.id]);assert.equal(await get(retry.id),3);
 await db.query("update dp_personal_drops set status='ready',weekly_sequence=99 where id=$1",[retry.id]);assert.equal(await get(retry.id),3);
 assert.equal((await insert(b,'weekly','ready','2026-10-02')).weekly_sequence,1);
 await db.exec('begin');assert.equal((await insert(a,'weekly','ready','2026-10-09')).weekly_sequence,4);await db.exec('rollback');
 assert.equal((await insert(a,'weekly','ready','2026-10-09')).weekly_sequence,4);
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
 assert.equal((await db.query('select * from dp_weekly_counters')).rows.length,1);
 await assert.rejects(db.query('update dp_weekly_counters set last_number=99'),/permission denied/);
 await db.exec('select dp_clear_personal_data()');assert.equal((await db.query('select * from dp_weekly_counters')).rows.length,0);
 await db.exec('reset role');assert.equal((await db.query('select * from dp_weekly_counters')).rows[0].user_id,b);
 }finally{await db.close();}
});
