import{applyFeed}from'./data.js';

export const feedState={status:'idle',source:'seed',message:'Demo data',loadedAt:null,quality:null};
const LIVE_MANIFEST='https://raw.githubusercontent.com/splntrAVdesigns/DROP-PORTAL-V1.0/main/weekly-feed/drops/index.json';
const DEPLOYED_MANIFEST='/weekly-feed/drops/index.json';

function httpsUrl(value){try{return new URL(value).protocol==='https:'}catch{return false}}
function validLink(link){return link&&typeof link.kind==='string'&&httpsUrl(link.url)}
function validPreview(preview){
  if(preview==null)return true;
  if(!preview||typeof preview!=='object'||typeof preview.provider!=='string')return false;
  if(preview.kind==='direct-audio')return(typeof preview.previewUrl==='string'&&(preview.previewUrl.startsWith('/')||httpsUrl(preview.previewUrl)))&&typeof preview.usageBasis==='string';
  if(preview.kind==='provider-embed')return httpsUrl(preview.embedUrl);
  return false;
}
function validTrack(t){return t&&typeof t.id==='string'&&typeof t.artistName==='string'&&typeof t.title==='string'&&typeof t.reason==='string'&&typeof t.subgenre==='string'&&typeof t.release==='string'&&typeof t.label==='string'&&typeof t.releaseDate==='string'&&Number.isInteger(t.lane)&&t.lane>=0&&t.lane<=3&&Number.isFinite(t.score)&&Number.isFinite(t.confidence)&&Array.isArray(t.links)&&t.links.length>0&&t.links.every(validLink)&&validPreview(t.preview)}
function validDrop(d){return d&&typeof d.id==='string'&&Array.isArray(d.ids)&&d.ids.length>0&&typeof d.period==='string'}
function validMix(m){return m&&typeof m.id==='string'&&typeof m.artistName==='string'&&typeof m.title==='string'&&Array.isArray(m.links)&&m.links.length>0&&m.links.every(validLink)&&validPreview(m.preview)}
function validProfileSnapshot(s){const numeric=['future','deep','jungle','depth','experimental','floor','darkness','breaks','count'];return s&&typeof s==='object'&&numeric.every(k=>Number.isFinite(s[k]))&&typeof s.mixes==='boolean'}
function validatePayload(p){
  if(!p||p.schemaVersion!==1||!validDrop(p.drop)||!Array.isArray(p.tracks))throw Error('Invalid DROP:PORTAL feed payload');
  if(!p.tracks.every(validTrack))throw Error('Published tracks failed the enrichment gate');
  if(Array.isArray(p.mixes)&&!p.mixes.every(validMix))throw Error('Published mixes failed the destination gate');
  const tracks=p.tracks.map(t=>({...t,links:t.links.map(link=>({...link}))})),ids=new Set(tracks.map(t=>t.id));
  if(!p.drop.ids.every(id=>ids.has(id)))throw Error('Drop references missing tracks');
  return{drop:p.drop,tracks,mixes:Array.isArray(p.mixes)?p.mixes.map(m=>({...m,links:m.links.map(link=>({...link}))})):[],profileSnapshot:validProfileSnapshot(p.profileSnapshot)?{...p.profileSnapshot}:null};
}
let appliedRevision=null,appliedAt=0;
async function json(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Feed request failed '+r.status);return r.json()}
async function loadManifest(url){
  const manifest=await json(url);
  if(!manifest||manifest.schemaVersion!==1||!Array.isArray(manifest.drops)||!manifest.drops.length)throw Error('No published drops');
  return {manifest,url};
}
export async function fetchWeeklyFeed(){
  const candidates=await Promise.allSettled([loadManifest(LIVE_MANIFEST+'?v='+Date.now()),loadManifest(DEPLOYED_MANIFEST+'?v='+Date.now())]);
  const available=candidates.filter(x=>x.status==='fulfilled').map(x=>x.value).sort((a,b)=>Date.parse(b.manifest.updatedAt)-Date.parse(a.manifest.updatedAt));
  for(const candidate of available){
    const {manifest,url}=candidate;
    const manifestAt=Date.parse(manifest.updatedAt);
    if(!Number.isFinite(manifestAt)||manifestAt<appliedAt)continue;
    const revision=JSON.stringify(manifest);
    if(revision===appliedRevision)return null;
    try{
      const entries=manifest.drops.filter(x=>x?.status==='published'&&x.url).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
      if(!entries.length)throw Error('No published entries');
      const base=new URL(url,globalThis.location?.origin||'http://localhost').href;
      const payloads=await Promise.all(entries.map(async entry=>{
        const target=new URL(entry.url,base);target.searchParams.set('v',manifest.updatedAt||entry.publishedAt);
        const payload=validatePayload(await json(target.href));
        if(payload.drop.id!==entry.id)throw Error('Manifest and payload IDs disagree');
        return payload;
      }));
      return {payloads,revision,manifestAt,source:url.startsWith('http')?'Live weekly feed':'Deployed feed snapshot'};
    }catch(error){console.warn('[DROP:PORTAL] feed candidate unavailable',error);}
  }
  throw Error('Latest feed could not be checked. Keeping the last loaded drop.');
}
export function commitWeeklyFeed(candidate){
  if(!candidate)return false;
  applyFeed(candidate.payloads);appliedRevision=candidate.revision;appliedAt=candidate.manifestAt;
  const current=candidate.payloads[0];
  Object.assign(feedState,{status:'ready',source:'github',message:candidate.source,loadedAt:new Date().toISOString(),quality:{tracks:current.tracks.length,withPreview:current.tracks.filter(t=>t.preview).length,withDestinations:current.tracks.filter(t=>t.links.length).length,mixes:current.mixes.length}});
  return true;
}
export async function loadWeeklyFeed(){
  feedState.status='loading';
  try{commitWeeklyFeed(await fetchWeeklyFeed());return true;}
  catch(error){feedState.status=appliedRevision?'stale':'fallback';feedState.message=error.message;return false;}
}
