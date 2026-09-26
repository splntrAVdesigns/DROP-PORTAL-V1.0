import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {PERSONAL_DEFAULTS,cleanPersonalProfile,effectivePersonalProfile,personalSearchRequest,feedbackMeaning} from '../lib/personal-contracts.js';
import {makeSessionHandler} from '../api/personal-session.js';
import {makePersonalDataHandler} from '../api/personal-data.js';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
const req=(method,body,extra={})=>({method,body,headers:{host:'drop.example',origin:'https://drop.example',...extra},query:{}});

test('personal semantics normalize names, enforce label focus, and expire weekly overrides by target date',()=>{
  const base=cleanPersonalProfile({...PERSONAL_DEFAULTS,artists:['  Photek ','photek'],labels:['Metalheadz'],focus:{mode:'recent',decade:null,labelSpecific:true,flags:['groove','deep-dig']}});
  assert.deepEqual(base.artists,['photek']);
  assert.throws(()=>cleanPersonalProfile({...PERSONAL_DEFAULTS,focus:{...PERSONAL_DEFAULTS.focus,labelSpecific:true}}));
  assert.throws(()=>cleanPersonalProfile({...PERSONAL_DEFAULTS,artists:['<script>']}));
  const state={base_profile:base,weekly_profile:{...base,searchPast:'1yr'},target_date:'2026-09-30',learning_enabled:false,revision:3};
  assert.equal(effectivePersonalProfile(state,'2026-09-30').searchPast,'1yr');
  assert.equal(effectivePersonalProfile(state,'2026-10-07').searchPast,'1mo');
  const plan=personalSearchRequest(state,'2026-09-30',new Date('2026-09-26T18:00:00Z'));
  assert.equal(plan.constraints.labelsOnly,true);assert.equal(plan.preferredArtists[0].identityStatus,'unresolved');
  assert.equal(plan.execution.ready,false);assert.equal(feedbackMeaning('heard',true),'neutral');assert.equal(feedbackMeaning('saved',false),'withdrawn');
});

test('database enforces two-user isolation, conflict protection, import precedence and learning opt-out',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users values('${a}'),('${b}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    await db.exec(await readFile(new URL('../db/migrations/001_personal_discovery.sql',import.meta.url),'utf8'));
    await db.exec('set role authenticated');
    const asUser=async id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    const save=async(profile,expected,learning=false)=>db.query('select * from public.dp_save_profile($1::jsonb,null,null,$2,$3)',[JSON.stringify(profile),learning,expected]);
    await asUser(a);await save(PERSONAL_DEFAULTS,0,true);
    await db.query("select * from public.dp_set_feedback('tune','saved',false,0,false)");
    await asUser(b);await save({...PERSONAL_DEFAULTS,artists:['Artist B']},0);
    assert.equal((await db.query('select * from public.dp_personal_profiles')).rows.length,1);
    assert.equal((await db.query('select * from public.dp_feedback')).rows.length,0);
    assert.equal((await db.query('delete from public.dp_personal_profiles where user_id=$1 returning *',[a])).rows.length,0);
    await assert.rejects(db.query("insert into public.dp_feedback(user_id,track_id,kind,value) values($1,'forged','saved',true)",[a]),/row-level security/);
    await asUser(a);
    await assert.rejects(save(PERSONAL_DEFAULTS,0),/revision_conflict/);
    await db.query("select * from public.dp_set_feedback('tune','saved',true,0,true)");
    assert.equal((await db.query('select value from public.dp_feedback')).rows[0].value,false,'import must not overwrite an existing false');
    await db.query("select * from public.dp_set_feedback('tune','heard',true,0,false)");
    const events=(await db.query('select meaning from public.dp_feedback_events order by id')).rows;
    assert.deepEqual(events.map(r=>r.meaning),['withdrawn','neutral']);
    await save(PERSONAL_DEFAULTS,1,false);
    assert.equal((await db.query('select * from public.dp_feedback_events')).rows.length,0);
    assert.equal((await db.query('select * from public.dp_feedback')).rows.length,2);
    await db.query('select public.dp_clear_personal_data()');
    assert.equal((await db.query('select * from public.dp_feedback')).rows.length,0);
    await asUser(b);assert.equal((await db.query('select * from public.dp_personal_profiles')).rows.length,1);
    await db.exec('set role anon');await assert.rejects(db.query('select * from public.dp_personal_profiles'),/permission denied/);
  }finally{await db.close();}
});

test('personal session verifies provider identity and stores credentials only in secure HttpOnly cookies',async()=>{
  const session={access_token:'secret-access',refresh_token:'secret-refresh',expires_in:3600};
  const handler=makeSessionHandler({configured:()=>true,emailAllowed:e=>e==='a@example.com',clientFactory:()=>({auth:{verifyOtp:async()=>({data:{session,user:{id:a,email:'a@example.com'}},error:null})}})});
  const res=response();await handler(req('POST',{action:'verify-code',email:'a@example.com',code:'123456'}),res);
  assert.equal(res.code,200);assert.equal(JSON.stringify(res.body).includes('secret'),false);
  assert.equal(res.headers['Set-Cookie'].every(c=>c.includes('HttpOnly; Secure; SameSite=Strict')),true);
  const denied=response();await handler(req('POST',{action:'verify-code',email:'a@example.com',code:'123456'},{origin:'https://evil.test'}),denied);assert.equal(denied.code,403);
  const other=response();await handler(req('POST',{action:'verify-code',email:'b@example.com',code:'123456'}),other);assert.equal(other.code,403);
});

test('personal writes reject a changed account and do not use publisher authentication',async()=>{
  const handler=makePersonalDataHandler({authenticate:async()=>({user:{id:a},client:{}})});
  const res=response();await handler(req('POST',{action:'save-profile'},{'x-personal-account':b}),res);assert.equal(res.code,409);
  const signedOut=makePersonalDataHandler({authenticate:async()=>{throw Object.assign(Error('Sign in'),{status:401});}});
  const denial=response();await signedOut(req('GET',null,{'x-drop-portal-admin-key':'publisher-key'}),denial);assert.equal(denial.code,401);
});
