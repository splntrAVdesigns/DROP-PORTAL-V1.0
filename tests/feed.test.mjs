import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyFeed,drops,mixes,getDropMixes,getFeedProfile} from '../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/data.js';
import {createFeedRefresh} from '../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/feed-refresh.js';
import {mergeInteractions,updateInteraction} from '../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/interactions.js';
import {embedPreview} from '../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/destinations.js';
const current=JSON.parse(fs.readFileSync('weekly-feed/drops/2026-09-23-test.json'));
const previous=JSON.parse(fs.readFileSync('weekly-feed/drops/2026-09-21-test.json'));
test('published data replaces seed archive; mixes and profiles stay scoped',()=>{
  applyFeed([current,previous]);assert.deepEqual(drops.map(d=>d.id),[current.drop.id,previous.drop.id]);
  assert.equal(getDropMixes(current.drop.id).length,2);assert.equal(getDropMixes(previous.drop.id).length,1);
  assert.deepEqual(getFeedProfile(previous.drop.id),previous.profileSnapshot);
  applyFeed([current,previous]);assert.equal(drops.length,2);assert.ok(mixes.length>=2);
});
test('fresh repository manifest beats valid stale deployed snapshot',async()=>{
  const {fetchWeeklyFeed,commitWeeklyFeed}=await import('../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/feed.js');
  const entry=p=>({id:p.drop.id,publishedAt:p===current?'2026-09-23T14:00:00Z':'2026-09-22T00:00:00Z',status:'published',url:p===current?'./new.json':'./old.json'});
  globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('index.json')?{schemaVersion:1,updatedAt:String(url).startsWith('https:')?'2026-09-23T14:00:00Z':'2026-09-22T00:00:00Z',drops:String(url).startsWith('https:')?[entry(current),entry(previous)]:[entry(previous)]}:String(url).includes('new.json')?current:previous});
  const candidate=await fetchWeeklyFeed();assert.equal(candidate.payloads[0].drop.id,current.drop.id);commitWeeklyFeed(candidate);
  assert.equal(await fetchWeeklyFeed(),null);
  globalThis.fetch=async url=>{if(String(url).startsWith('https:'))throw Error('offline');return {ok:true,json:async()=>({schemaVersion:1,updatedAt:'2026-09-22T00:00:00Z',drops:[entry(previous)]})};};await assert.rejects(fetchWeeklyFeed());assert.equal(drops[0].id,current.drop.id);
});
test('new feed waits for playback/editing to finish and commits once',async()=>{
  let allowed=false,commits=0,pending=false;
  const refresh=createFeedRefresh({canApply:()=>allowed,onApplied(){},onPending:v=>pending=v,onError:assert.fail,fetchFeed:async()=>({id:'new'}),commitFeed:()=>commits++});
  await refresh.check();assert.equal(commits,0);assert.equal(pending,true);allowed=true;refresh.flush();refresh.flush();assert.equal(commits,1);assert.equal(pending,false);
});
test('Saved/Heard merge across tabs preserves explicit false values',()=>{
  const a=updateInteraction({},'track','saved',true,1),b=updateInteraction(a,'track','heard',true,2),c=updateInteraction(a,'track','saved',false,3);
  const merged=mergeInteractions(b,c);assert.equal(merged.track.saved,false);assert.equal(merged.track.heard,true);
  assert.deepEqual(mergeInteractions(merged,JSON.parse(JSON.stringify(merged))),merged);
});
test('a verified enrichment adds a preview without rewriting the published payload',async()=>{
  const {fetchWeeklyFeed}=await import('../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/feed.js');
  const live=JSON.parse(fs.readFileSync('weekly-feed/drops/2026-09-23.json'));
  const amendment=JSON.parse(fs.readFileSync('weekly-feed/drops/2026-09-23.enrichment.json'));
  const manifest={schemaVersion:1,updatedAt:'2026-09-25T00:00:00Z',drops:[{id:'004',status:'published',publishedAt:live.drop.publishedAt,url:'./2026-09-23.json',enrichmentUrl:'./2026-09-23.enrichment.json'}]};
  globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('index.json')?manifest:String(url).includes('.enrichment.json')?amendment:live});
  const candidate=await fetchWeeklyFeed();
  assert.equal(candidate.payloads[0].tracks.filter(t=>t.preview).length,12);
  assert.equal(live.tracks.filter(t=>t.preview).length,0);
  assert.equal(candidate.payloads[0].tracks[0].preview.provider,'BANDCAMP');
});
test('non-Bandcamp listening links resolve provider-owned players',()=>{
  const soundcloud=embedPreview({links:[{kind:'listening',url:'https://soundcloud.com/artist/verified-track'}]});
  assert.equal(soundcloud.provider,'SOUNDCLOUD');
  assert.equal(new URL(soundcloud.url).hostname,'w.soundcloud.com');
  const mixcloud=embedPreview({links:[{kind:'listening',url:'https://www.mixcloud.com/artist/session/'}]});
  assert.equal(mixcloud.provider,'MIXCLOUD');
  assert.equal(new URL(mixcloud.url).searchParams.get('feed'),'/artist/session/');
});
