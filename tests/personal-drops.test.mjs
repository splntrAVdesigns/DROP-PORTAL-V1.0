import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {parseHTML} from 'linkedom';
import {PERSONAL_DEFAULTS} from '../lib/personal-contracts.js';
import {nextPersonalOccurrence,oneTimeInstant,curatePersonalDrop} from '../lib/personal-discovery.js';
import {withVerifiedPreviews} from '../api/personal-worker.js';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';

test('published preview amendments add safe players without replacing original evidence',async()=>{
  const base=new URL('../weekly-feed/drops/',import.meta.url);
  const payload=JSON.parse(await readFile(new URL('2026-09-30.json',base)));
  const amendment=JSON.parse(await readFile(new URL('2026-09-30.enrichment.json',base)));
  const entry={id:'006',url:'./2026-09-30.json'};
  const merged=withVerifiedPreviews(payload,amendment,entry);
  const amendedId=amendment.tracks[0].id;
  assert.equal(merged.tracks.find(t=>t.id===amendedId).preview?.provider,'BANDCAMP');
  assert.equal(merged.tracks[0].id,payload.tracks[0].id);
  const hostile=structuredClone(amendment);
  hostile.tracks[0].preview.embedUrl='https://example.com/widget/';
  assert.equal(withVerifiedPreviews(payload,hostile,entry).tracks.find(t=>t.id===amendedId).preview,null);
  hostile.tracks[1].id='unknown-track';
  assert.equal(withVerifiedPreviews(payload,hostile,entry),payload);
});

test('weekly and one-time schedules respect Chicago time and date bounds',()=>{
  assert.equal(nextPersonalOccurrence(3,'19:00',new Date('2026-10-01T12:00:00Z')).toISOString(),'2026-10-08T00:00:00.000Z');
  assert.equal(oneTimeInstant('2026-10-01','18:00',new Date('2026-10-01T15:00:00Z')).toISOString(),'2026-10-01T23:00:00.000Z');
  assert.throws(()=>oneTimeInstant('2026-09-30','18:00',new Date('2026-10-01T15:00:00Z')));
});

test('private curator uses release evidence and taste, and never fills a shortage with fake results',()=>{
  const profile={...PERSONAL_DEFAULTS,count:10,artists:['Artist 3'],labels:['Label A'],searchPast:'1mo'};
  const tracks=Array.from({length:12},(_,i)=>({id:'track-'+i,artistName:'Artist '+i,title:'Cut '+i,label:'Label A',
    releaseDate:'2026-09-20',lane:i%3,score:80,links:[{kind:'listen',url:'https://example.com/'+i}],reason:'Verified release',preview:null}));
  const picked=curatePersonalDrop([{tracks}],profile,[],new Date('2026-10-01T23:00:00Z'));
  assert.equal(picked.status,'ready');assert.equal(picked.result.tracks[0].id,'track-3');assert.equal(picked.result.tracks.length,10);
  assert.equal(curatePersonalDrop([{tracks:tracks.slice(0,9)}],profile,[],new Date('2026-10-01T23:00:00Z')).status,'needs_research');
  assert.equal(curatePersonalDrop([{tracks}],{...profile,searchPast:'1mo'},[],new Date('2026-12-01T23:00:00Z')).status,'needs_research');
  assert.equal(curatePersonalDrop([{tracks}],{...profile,focus:{...profile.focus,labelSpecific:true},labels:['Other']},[],new Date('2026-10-01T23:00:00Z')).status,'needs_research');
});

test('personal depth and experimental bias change the verified catalog order',()=>{
  const tracks=Array.from({length:10},(_,i)=>({id:'choice-'+i,artistName:'Artist '+i,title:'Release '+i,
    label:'Label',releaseDate:i===0?'2026-09-03':'2026-09-30',lane:i===1?0:1,score:80,
    links:[{kind:'listen',url:'https://example.com/'+i}]}));
  const at=new Date('2026-10-01T23:00:00Z');
  const p={...PERSONAL_DEFAULTS,count:10,future:50,deep:50,jungle:50,depth:0,experimental:50};
  const recent=curatePersonalDrop([{tracks}],p,[],at).result.tracks.map(t=>t.id);
  const older=curatePersonalDrop([{tracks}],{...p,depth:100},[],at).result.tracks.map(t=>t.id);
  assert.ok(recent.indexOf('choice-0')>older.indexOf('choice-0'));
  const low=curatePersonalDrop([{tracks}],{...p,experimental:0},[],at).result.tracks.map(t=>t.id);
  const high=curatePersonalDrop([{tracks}],{...p,experimental:100},[],at).result.tracks.map(t=>t.id);
  assert.ok(low.indexOf('choice-1')>high.indexOf('choice-1'));
});

test('migration 003 isolates plans and drops for two accounts and deletes only the owner data',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key); insert into auth.users values('${a}'),('${b}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    await db.exec(await readFile(new URL('../db/migrations/001_personal_discovery.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../db/migrations/003_personal_drops.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../db/migrations/004_one_time_replacement.sql',import.meta.url),'utf8'));
    await db.exec('set role authenticated');
    const as=async id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    const save=async()=>db.query('select * from public.dp_save_personal_plan($1::jsonb,null,null,false,0,3,$2::time,$3::timestamptz)',
      [JSON.stringify(PERSONAL_DEFAULTS),'19:00',nextPersonalOccurrence(3,'19:00').toISOString()]);
    await as(a);await save();
    await db.query("select * from public.dp_request_one_time(now(),$1::jsonb)",[JSON.stringify(PERSONAL_DEFAULTS)]);
    await as(b);await save();
    assert.equal((await db.query('select * from public.dp_personal_plans')).rows.length,1);
    assert.equal((await db.query('select * from public.dp_personal_drops')).rows.length,0);
    await assert.rejects(db.query("update public.dp_personal_drops set status='ready'"),/permission denied/);
    await as(a);
    assert.equal((await db.query('select * from public.dp_personal_drops')).rows.length,1);
    await db.query('select public.dp_clear_personal_data()');
    assert.equal((await db.query('select * from public.dp_personal_drops')).rows.length,0);
    await as(b);assert.equal((await db.query('select * from public.dp_personal_plans')).rows.length,1);
  }finally{await db.close();}
});

test('one-time replacements cancel the previous account job while retaining ready results and request limits',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key); insert into auth.users values('${a}'),('${b}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    await db.exec(await readFile(new URL('../db/migrations/001_personal_discovery.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../db/migrations/003_personal_drops.sql',import.meta.url),'utf8'));
    await db.exec('set role authenticated');
    const as=async id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    const request=async minutes=>db.query('select * from public.dp_request_one_time(now()+($1::integer * interval \'1 minute\'),$2::jsonb)',[minutes,JSON.stringify(PERSONAL_DEFAULTS)]);
    await as(a);const first=(await request(10)).rows[0];
    await as(b);const other=(await request(20)).rows[0];
    await as(a);
    // Migration also repairs older deployments with multiple queued requests.
    await db.exec('reset role');
    await db.exec(await readFile(new URL('../db/migrations/004_one_time_replacement.sql',import.meta.url),'utf8'));
    await db.exec('set role authenticated');await as(a);
    const second=(await request(30)).rows[0];
    assert.notEqual(second.id,first.id);
    assert.equal((await db.query("select status from public.dp_personal_drops where id=$1",[first.id])).rows[0].status,'superseded');
    assert.equal((await db.query("select count(*)::integer as n from public.dp_personal_drops where status='queued'")).rows[0].n,1);
    // A completed dig remains available in history after another request.
    await db.exec('reset role');await db.query("update public.dp_personal_drops set status='ready' where id=$1",[second.id]);
    await db.exec('set role authenticated');await as(a);
    const third=(await request(40)).rows[0];
    assert.equal((await db.query("select status from public.dp_personal_drops where id=$1",[second.id])).rows[0].status,'ready');
    await assert.rejects(request(50),/Too many dig requests/);
    await as(b);assert.equal((await db.query("select status from public.dp_personal_drops where id=$1",[other.id])).rows[0].status,'queued');
    assert.ok(third.id);
  }finally{await db.close();}
});

test('private dashboard gates the board and shows only the signed-in account drops',async()=>{
  const {window}=parseHTML('<html><body><header><nav></nav><div class="utilities"><button id="tuner"></button><button id="edit"></button><div id="palette-controls"></div></div></header><span id="saved-count"></span><main id="app"></main></body></html>');
  globalThis.window=window;globalThis.document=window.document;globalThis.location={pathname:'/',hash:''};
  const savedInterval=globalThis.setInterval,savedStorage=globalThis.localStorage;
  const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  globalThis.setInterval=()=>0;
  try{
    const {personal}=await import('../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/personal.js');
    const {privateDrops}=await import('../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/personal-drops-client.js');
    const {renderPrivateDashboard,setupPrivateDashboard,enablePrivateDashboard}=await import('../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/personal-dashboard.js');
    setupPrivateDashboard();
    personal.checked=true;personal.user=null;renderPrivateDashboard();
    enablePrivateDashboard();
    assert.match(window.document.querySelector('#app').textContent,/SEND SIGN-IN CODE/);
    assert.doesNotMatch(window.document.querySelector('#app').textContent,/Public weekly drop/);
    personal.user={id:a,email:'a@example.com'};privateDrops.owner=a;privateDrops.plan=null;privateDrops.drops=[];renderPrivateDashboard();
    assert.match(window.document.querySelector('#app').textContent,/Set your taste and weekly time/);
    assert.ok(window.document.querySelector('#ascii-hero-canvas'));
    assert.match(window.document.querySelector('.ascii-hero-chrome').textContent,/DROP \/ —/);
    assert.equal(window.document.querySelector('#edit').hidden,false);
    privateDrops.drops=[{id:'11111111-1111-4111-8111-111111111112',kind:'one_time',status:'ready',result:{note:'Verified catalog',tracks:[{id:'t1',artistName:'A',title:'Private A',personalRank:1,links:[],releaseDate:'2026-09-30',reason:'A',lane:0,preview:{kind:'provider-embed',embedUrl:'https://bandcamp.com/EmbeddedPlayer/track=123/'}}]}},{id:'11111111-1111-4111-8111-111111111115',kind:'weekly',status:'ready',weekly_sequence:2,result:{note:'Weekly catalog',tracks:[]}}];
    renderPrivateDashboard();assert.match(window.document.querySelector('#app').textContent,/Private A/);
    assert.match(window.document.querySelector('.ascii-hero-chrome').textContent,/DROP \/ 002/,'latest weekly number remains visible during a One Time Dig');
    assert.ok(window.document.querySelector('[data-personal-preview]'));
    const {playPersonalPreview}=await import('../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/personal-listening.js');
    await playPersonalPreview('t1');
    const frame=window.document.querySelector('iframe');assert.ok(frame);
    assert.ok(window.document.querySelector('.personal-top-three'));
    assert.ok(window.document.querySelector('.personal-remaining'));
    assert.match(window.document.querySelector('.private-lane-key').textContent,/Future/);
    window.document.querySelector('#edit').click();
    assert.equal(window.document.querySelector('#edit').getAttribute('aria-expanded'),'true');
    assert.equal(window.document.querySelector('.private-gradient-editor [data-hero-palette]').getAttribute('aria-label'),'Cyan to violet');
    window.document.querySelector('.private-gradient-editor [data-hero-palette="teal-coral"]').click();
    assert.equal(window.document.querySelector('#personal-listening-dock').style.getPropertyValue('--listening-color-a'),'#00F5C4');
    assert.equal(window.document.querySelector('iframe'),frame,'choosing a palette keeps playback mounted');
    window.document.querySelector('[data-layout-panel="queue"]').click();
    assert.equal(window.document.querySelector('.private-queue').classList.contains('compact'),true);
    assert.equal(window.document.querySelector('iframe'),frame,'layout edits should keep the player attached');
    privateDrops.loading=true;renderPrivateDashboard();assert.equal(window.document.querySelector('iframe'),frame);
    personal.feedback={'t1:saved':{track_id:'t1',kind:'saved',value:true,updated_at:new Date().toISOString()}};
    renderPrivateDashboard();assert.equal(window.document.querySelector('iframe'),frame);
    assert.equal(window.document.querySelector('[data-personal-kind=saved]').textContent,'Save ✓');
    assert.equal(window.document.querySelector('[data-personal-kind=saved]').getAttribute('aria-pressed'),'true');
    assert.equal(window.document.querySelector('[data-personal-kind=heard]').textContent,'Heard');
    privateDrops.drops=[
      {id:'11111111-1111-4111-8111-111111111113',kind:'one_time',status:'queued',created_at:'2026-10-01T20:00:00Z',scheduled_at:'2026-10-02T02:00:00Z'},
      {id:'11111111-1111-4111-8111-111111111114',kind:'one_time',status:'queued',created_at:'2026-10-02T11:00:00Z',scheduled_at:'2026-10-02T13:00:00Z'}
    ];renderPrivateDashboard();
    assert.match(window.document.querySelector('#app .private-queue').textContent,/8:00 AM/);
    assert.doesNotMatch(window.document.querySelector('#app .private-queue').textContent,/9:00 PM/);
    personal.user={id:b,email:'b@example.com'};privateDrops.owner=b;privateDrops.drops=[];renderPrivateDashboard();
    assert.doesNotMatch(window.document.querySelector('#app').textContent,/Private A/);
    assert.equal(window.document.querySelector('iframe'),null,'account changes unload the private preview');
    assert.equal(window.document.querySelector('.private-queue').classList.contains('wide'),true,'account B starts with its own layout');
    personal.user={id:a,email:'a@example.com'};privateDrops.owner=a;renderPrivateDashboard();
    assert.equal(window.document.querySelector('.private-queue').classList.contains('compact'),true,'account A retains its layout');
    const {setPrivateAvailability}=await import('../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/personal-dashboard.js');
    setPrivateAvailability('setup_required');renderPrivateDashboard();
    assert.match(window.document.querySelector('#app').textContent,/portal is being prepared/);
    assert.equal(window.document.querySelector('#tuner').hidden,true);
    setPrivateAvailability('ready');
  }finally{globalThis.setInterval=savedInterval;if(savedStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=savedStorage;delete globalThis.window;delete globalThis.document;delete globalThis.location;}
});
